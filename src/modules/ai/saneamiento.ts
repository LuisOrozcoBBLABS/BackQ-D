import { SECTORES, Sector, normalizarSector } from './sectores';

/**
 * Saneamiento de la respuesta del modelo.
 *
 * Es la pieza central de este módulo, y la razón es concreta: el borrador que
 * devolvemos tiene que poder mandarse tal cual a POST /projects, que valida con
 * `whitelist + forbidNonWhitelisted`. Una clave inventada por el modelo, una URL
 * vacía o un texto de nueve mil caracteres no producen un borrador feo: producen
 * un 400 en la cara de la persona, después de haber esperado a la IA.
 *
 * Dos decisiones de diseño que conviene entender antes de tocar esto:
 *
 * 1. El `responseSchema` de Gemini soporta `enum`, `required`, `items` y rangos
 *    numéricos, pero NO `maxLength` para strings. Los topes del DTO no se pueden
 *    delegar al proveedor: se piden por prompt y se IMPONEN acá.
 * 2. `sanearBorrador` construye el objeto campo por campo y nunca copia el
 *    crudo. Así las claves que el modelo invente se descartan por construcción,
 *    que es exactamente lo que `forbidNonWhitelisted` exige aguas abajo.
 *
 * Todo lo de este archivo es puro y total: nada lanza. Un modelo que devuelve
 * basura tiene que terminar en un 502 con mensaje, no en un stack trace.
 */

/** Topes reales del CreateProjectDto de projects. Si cambian allá, cambian acá. */
export const LIMITES = {
  nombre: 140,
  texto: 4000,
  similarNombre: 120,
  similarUrl: 400,
  maxSimilares: 6,
} as const;

const NOMBRE_MINIMO = 2; // @MinLength(2) del DTO
const NOMBRE_DE_ULTIMO_RECURSO = 'Propuesta sin título';

export interface SimilarSaneado {
  name: string;
  url: string;
}

export interface BorradorSaneado {
  nombre: string;
  sector: Sector;
  problema: string;
  dolores: string;
  solucion: string;
  plusIA: string;
  similares: SimilarSaneado[];
}

export interface Saneado {
  borrador: BorradorSaneado;
  /** Qué se tuvo que corregir, en frases para la persona que va a revisar. */
  avisos: string[];
}

export interface ContextoSaneo {
  /** Nombre del archivo, ya pasado por nombreSeguro(). Fallback del nombre. */
  nombreArchivo: string;
}

/**
 * Rescata el JSON de la respuesta. Aunque pidamos `responseMimeType: json`, un
 * modelo puede devolverlo entre cercos de markdown o con una frase alrededor.
 */
export function extraerJson(texto: unknown): unknown | null {
  if (typeof texto !== 'string') return null;
  const bruto = texto.trim();
  if (!bruto) return null;

  const intentos = [bruto, sinCercos(bruto), entreLlaves(bruto)];
  for (const intento of intentos) {
    if (!intento) continue;
    try {
      return JSON.parse(intento) as unknown;
    } catch {
      /* siguiente intento */
    }
  }
  return null;
}

function sinCercos(s: string): string | null {
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  return m ? m[1] : null;
}

function entreLlaves(s: string): string | null {
  const desde = s.indexOf('{');
  const hasta = s.lastIndexOf('}');
  return desde >= 0 && hasta > desde ? s.slice(desde, hasta + 1) : null;
}

/**
 * Normaliza texto que viene de un documento o de un modelo: saltos de línea
 * uniformes, sin caracteres de control ni invisibles, sin runs de espacios.
 *
 * Vive acá y no en extraccion.ts a propósito: este archivo no tiene ninguna
 * dependencia, y extraccion.ts arrastra unpdf y mammoth. Si `limpiarTexto`
 * viviera allá, saneamiento.spec.ts cargaría PDF.js para nada.
 */
export function limpiarTexto(valor: string): string {
  return valor
    .replace(/\r\n?/g, '\n')
    // Controles salvo \n y \t: un \0 o un \f del PDF ensucian el textarea.
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    // Invisibles: zero-width, joiners y BOM incrustado.
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Recorta a `max` unidades UTF-16 (lo que cuenta `@MaxLength`), cortando en
 * límite de palabra y sin partir un par surrogate — media pareja es un carácter
 * de reemplazo en la pantalla de la persona.
 */
export function recortar(valor: string, max: number): string {
  if (valor.length <= max) return valor;

  let corte = max;
  const anterior = valor.charCodeAt(corte - 1);
  if (anterior >= 0xd800 && anterior <= 0xdbff) corte -= 1; // alto suelto

  const trozo = valor.slice(0, corte);
  const espacio = Math.max(trozo.lastIndexOf(' '), trozo.lastIndexOf('\n'));
  // Solo cortamos en palabra si no perdemos un pedazo grande del texto.
  const elegido = espacio > max * 0.6 ? trozo.slice(0, espacio) : trozo;
  return elegido.trimEnd();
}

/**
 * Devuelve una URL http(s) absoluta, o null si no hay forma de confiar en ella.
 *
 * La allowlist de protocolo no es contra la alucinación: es contra la inyección.
 * El front pinta esta URL en un `href`, así que `javascript:` o `data:` serían
 * XSS servido por nuestra propia API.
 */
export function sanearUrl(crudo: unknown): string | null {
  if (typeof crudo !== 'string') return null;
  const bruto = crudo.trim();
  if (!bruto) return null;

  let candidato: string;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(bruto)) {
    candidato = bruto; // ya trae esquema completo
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(bruto) && !/^[^:]*\./.test(bruto)) {
    // Esquema sin barras (javascript:, data:, mailto:). Se deja pasar al parseo
    // para que lo rechace la allowlist, en vez de disfrazarlo con un https://.
    candidato = bruto;
  } else {
    // Dominio suelto: @IsUrl lo aceptaría, pero el front lo renderiza como link.
    candidato = `https://${bruto}`;
  }

  let url: URL;
  try {
    url = new URL(candidato);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.') || url.hostname.endsWith('.')) return null;

  const final = url.toString();
  // Una URL no se puede recortar sin romperla: si no cabe, no va.
  return final.length <= LIMITES.similarUrl ? final : null;
}

/** Clave de comparación para deduplicar: host y camino, sin ruido. */
function claveUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return url.toLowerCase();
  }
}

function comoTexto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

/**
 * Convierte lo que devolvió el modelo en algo que el CreateProjectDto acepta,
 * o null si no hay nada rescatable (el llamador responde 502).
 *
 * El invariante lo verifica saneamiento.contrato.spec.ts contra el DTO real, no
 * contra una copia de sus reglas.
 */
export function sanearBorrador(crudo: unknown, ctx: ContextoSaneo): Saneado | null {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;

  const c = crudo as Record<string, unknown>;
  const avisos: string[] = [];

  const nombre = sanearNombre(c['nombre'], ctx, avisos);
  const sector = sanearSector(c['sector'], avisos);
  const problema = sanearCampo(c['problema'], 'el problema', avisos);
  const dolores = sanearCampo(c['dolores'], 'los dolores', avisos);
  const solucion = sanearCampo(c['solucion'], 'la solución', avisos);
  const plusIA = sanearCampo(c['plusIA'], 'el plus con IA', avisos);
  const similares = sanearSimilares(c['similares'], avisos);

  return {
    borrador: { nombre, sector, problema, dolores, solucion, plusIA, similares },
    avisos,
  };
}

function sanearNombre(crudo: unknown, ctx: ContextoSaneo, avisos: string[]): string {
  const propuesto = limpiarTexto(comoTexto(crudo)).replace(/\n+/g, ' ').trim();
  if (propuesto.length >= NOMBRE_MINIMO) {
    const recortado = recortar(propuesto, LIMITES.nombre);
    if (recortado.length !== propuesto.length) {
      avisos.push('El nombre propuesto era muy largo y se recortó.');
    }
    // Un recorte agresivo podría dejarlo por debajo del mínimo del servidor.
    if (recortado.length >= NOMBRE_MINIMO) return recortado;
  }

  const delArchivo = limpiarTexto(
    ctx.nombreArchivo.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
  ).trim();
  if (delArchivo.length >= NOMBRE_MINIMO) {
    avisos.push('El modelo no propuso un nombre: usamos el del archivo. Convendría cambiarlo.');
    return recortar(delArchivo, LIMITES.nombre);
  }

  avisos.push('No se pudo deducir un nombre. Escribilo antes de guardar.');
  return NOMBRE_DE_ULTIMO_RECURSO;
}

function sanearSector(crudo: unknown, avisos: string[]): Sector {
  const { sector, exacto } = normalizarSector(crudo);
  if (!exacto) {
    const propuesto = limpiarTexto(comoTexto(crudo)).slice(0, 60);
    avisos.push(
      propuesto
        ? `El sector propuesto ("${propuesto}") no está en la lista: quedó como "${sector}".`
        : `El modelo no propuso un sector válido: quedó como "${sector}".`,
    );
  }
  return sector;
}

function sanearCampo(crudo: unknown, etiqueta: string, avisos: string[]): string {
  // Vacío y no undefined: pasa el DTO y le simplifica el binding al front.
  const limpio = limpiarTexto(comoTexto(crudo));
  const recortado = recortar(limpio, LIMITES.texto);
  if (recortado.length !== limpio.length) {
    avisos.push(`El texto de ${etiqueta} superaba el máximo y se recortó.`);
  }
  return recortado;
}

function sanearSimilares(crudo: unknown, avisos: string[]): SimilarSaneado[] {
  if (!Array.isArray(crudo)) return [];

  // El slice va antes del mapeo: no vale la pena sanear treinta para tirar 24.
  const candidatos = crudo.slice(0, LIMITES.maxSimilares);
  if (crudo.length > LIMITES.maxSimilares) {
    avisos.push(
      `El modelo propuso ${crudo.length} apps parecidas: nos quedamos con las primeras ${LIMITES.maxSimilares}.`,
    );
  }

  const salida: SimilarSaneado[] = [];
  const vistas = new Set<string>();
  let descartados = 0;

  for (const item of candidatos) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      descartados += 1;
      continue;
    }
    const fila = item as Record<string, unknown>;

    const url = sanearUrl(fila['url']);
    if (!url) {
      // La trampa clásica: {name:'Trello', url:''} hace fallar todo el POST.
      descartados += 1;
      continue;
    }

    const clave = claveUrl(url);
    if (vistas.has(clave)) {
      descartados += 1;
      continue;
    }

    const propuesto = limpiarTexto(comoTexto(fila['name'])).replace(/\n+/g, ' ').trim();
    const name = recortar(propuesto, LIMITES.similarNombre) || nombreDesdeHost(url);
    if (!name) {
      descartados += 1;
      continue;
    }

    vistas.add(clave);
    salida.push({ name, url });
  }

  if (descartados > 0) {
    avisos.push(
      descartados === 1
        ? 'Se descartó una app parecida porque su URL no era usable.'
        : `Se descartaron ${descartados} apps parecidas porque su URL no era usable o estaba repetida.`,
    );
  }

  return salida;
}

/** Con URL válida y sin nombre, el host es mejor que descartar el item. */
function nombreDesdeHost(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const raiz = host.split('.')[0] ?? '';
    return raiz ? raiz.charAt(0).toUpperCase() + raiz.slice(1) : '';
  } catch {
    return '';
  }
}

/** Reexportado para el prompt: el `enum` del responseSchema sale de acá. */
export { SECTORES };
