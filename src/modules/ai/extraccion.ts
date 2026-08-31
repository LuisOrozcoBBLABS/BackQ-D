import * as mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { FormatoDocumento } from './formato';
import { limpiarTexto } from './saneamiento';

/**
 * Extracción del texto del documento. Todo en memoria: el buffer llega de
 * multer con `memoryStorage` y se libera al terminar el request. Nada de
 * diskStorage, nada de /tmp.
 *
 * `unpdf` empaqueta el build serverless de PDF.js — sin worker y sin binarios
 * nativos, que es justo lo que este repo evita (por eso @node-rs/argon2). El
 * precio de no tener worker está en el límite de páginas de abajo.
 */

export interface TextoExtraido {
  texto: string;
  caracteresLeidos: number;
  truncado: boolean;
  /** Solo para PDF; en DOCX no existe el concepto. */
  paginas: number | null;
}

export type ResultadoExtraccion =
  | { ok: true; datos: TextoExtraido }
  | { ok: false; motivo: string };

export interface LimitesExtraccion {
  maxCaracteres: number;
  maxPaginasPdf: number;
}

/**
 * Debajo de esto damos por hecho que el PDF no tiene capa de texto.
 * Doscientos caracteres es menos que un párrafo: un documento real siempre
 * supera eso, y una foto de páginas nunca llega.
 */
const MINIMO_UTIL = 200;

export async function extraerTexto(
  buffer: Buffer,
  formato: FormatoDocumento,
  limites: LimitesExtraccion,
): Promise<ResultadoExtraccion> {
  const bruto = formato === 'pdf' ? await leerPdf(buffer, limites) : await leerDocx(buffer);
  if (!bruto.ok) return bruto;

  const limpio = limpiarTexto(bruto.texto);

  // Nunca mandarle texto vacío al modelo: gasta cuota y devuelve un borrador
  // 100% alucinado, que para la persona es peor que un error claro.
  if (limpio.length < MINIMO_UTIL) {
    return {
      ok: false,
      motivo:
        'No se pudo leer texto del documento. Si es un PDF escaneado no tiene texto ' +
        'seleccionable: subí la versión digital o pegá el contenido a mano.',
    };
  }

  const { texto, truncado } = truncar(limpio, limites.maxCaracteres);

  return {
    ok: true,
    datos: { texto, caracteresLeidos: texto.length, truncado, paginas: bruto.paginas },
  };
}

type Bruto = { ok: true; texto: string; paginas: number | null } | { ok: false; motivo: string };

async function leerPdf(buffer: Buffer, limites: LimitesExtraccion): Promise<Bruto> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
  } catch {
    // El detector ya vio el %PDF-, así que llegar acá es un PDF corrupto o cifrado.
    return {
      ok: false,
      motivo:
        'El PDF no se pudo abrir. Puede estar dañado o protegido con contraseña: ' +
        'abrilo, guardalo sin protección y volvé a subirlo.',
    };
  }

  // El límite de páginas se revisa ANTES de extraer, y no es capricho: el build
  // serverless de PDF.js corre en el event loop sin worker, así que un PDF de
  // 300 páginas bloquea el proceso entero durante segundos.
  if (pdf.numPages > limites.maxPaginasPdf) {
    return {
      ok: false,
      motivo:
        `El PDF tiene ${pdf.numPages} páginas y el máximo son ${limites.maxPaginasPdf}. ` +
        'Subí solo la parte que importa.',
    };
  }

  try {
    const { text } = await extractText(pdf, { mergePages: true });
    // Con mergePages el tipo es string, pero no nos apoyamos en eso: si una
    // versión de unpdf devolviera el texto por páginas, esto sigue funcionando.
    const crudo: string | string[] = text;
    return {
      ok: true,
      texto: Array.isArray(crudo) ? crudo.join('\n') : crudo,
      paginas: pdf.numPages,
    };
  } catch {
    return { ok: false, motivo: 'No se pudo extraer el texto del PDF.' };
  }
}

async function leerDocx(buffer: Buffer): Promise<Bruto> {
  try {
    // Los `messages` que devuelve mammoth NO se logean: pueden citar contenido
    // del documento, y eso es exactamente lo que la política de logs prohíbe.
    const { value } = await mammoth.extractRawText({ buffer });
    return { ok: true, texto: value, paginas: null };
  } catch {
    return {
      ok: false,
      motivo: 'El documento de Word no se pudo leer. Puede estar dañado o protegido.',
    };
  }
}

/** Corta en el último límite de párrafo, para no partir una idea a la mitad. */
function truncar(texto: string, max: number): { texto: string; truncado: boolean } {
  if (texto.length <= max) return { texto, truncado: false };

  const trozo = texto.slice(0, max);
  const parrafo = trozo.lastIndexOf('\n\n');
  const corte = parrafo > max * 0.5 ? parrafo : trozo.lastIndexOf('\n');
  const elegido = corte > max * 0.3 ? trozo.slice(0, corte) : trozo;

  return { texto: elegido.trimEnd(), truncado: true };
}
