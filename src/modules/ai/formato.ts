/**
 * Reconocimiento del archivo subido. Funciones puras, sin dependencias.
 *
 * Regla que gobierna todo este archivo: **el contenido decide, el mimetype no**.
 * El `Content-Type` de una parte multipart lo elige el cliente, y en Windows sale
 * de la extensión: renombrar `payload.zip` a `pliego.pdf` produce
 * `application/pdf` sin que el contenido cambie ni un byte. Y al revés, varios
 * clientes mandan `application/octet-stream` para un DOCX perfectamente válido,
 * así que rechazar por mimetype genera falsos negativos. El mimetype sirve como
 * allowlist previa barata, nunca como decisión.
 *
 * También se descartó el FileTypeValidator de Nest: carga `file-type` con un
 * import() de ESM que en Jest CJS falla devolviendo false (rechazaría todo en los
 * tests), y sus mensajes están en inglés.
 */

export type FormatoDocumento = 'pdf' | 'docx';

export type Reconocimiento =
  | { ok: true; formato: FormatoDocumento }
  | { ok: false; motivo: string };

/** Cuánto del principio se mira buscando la firma del PDF. */
const VENTANA_PDF = 1024;

const FIRMA_ZIP = [0x50, 0x4b, 0x03, 0x04];
const FIRMA_OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function empiezaCon(buffer: Buffer, firma: number[]): boolean {
  if (buffer.length < firma.length) return false;
  return firma.every((byte, i) => buffer[i] === byte);
}

/**
 * Decide el formato mirando los bytes.
 *
 * El contenido se revisa PRIMERO y el mimetype después, y ese orden no es
 * estético: un .doc viejo llega como `application/msword`, así que una allowlist
 * de mimetypes por delante lo rechazaría con el mensaje genérico en lugar del que
 * explica cómo arreglarlo. El mimetype solo entra en juego cuando el contenido no
 * dijo nada, y ahí sirve para dar un mensaje más preciso ("es una imagen") en vez
 * de uno genérico. Nunca puede tapar una decisión tomada por contenido.
 */
export function detectarFormato(buffer: Buffer, mimetype: string): Reconocimiento {
  if (!buffer || buffer.length < 8) {
    return { ok: false, motivo: 'El archivo está vacío.' };
  }

  // El %PDF- no siempre está en el offset 0: hay PDFs reales con basura o un BOM
  // adelante, y PDF.js los tolera. Buscarlo solo en el byte 0 los rechazaría.
  if (buffer.subarray(0, VENTANA_PDF).includes('%PDF-')) {
    return { ok: true, formato: 'pdf' };
  }

  if (empiezaCon(buffer, FIRMA_ZIP)) return reconocerZip(buffer);

  if (empiezaCon(buffer, FIRMA_OLE2)) {
    // Merece mensaje propio: es el error más común de la gente, y un
    // "formato no soportado" no le dice qué hacer al respecto.
    return {
      ok: false,
      motivo:
        'Es un documento de Word antiguo (.doc) o está protegido con contraseña. ' +
        'Abrilo y guardalo como .docx o PDF, y volvé a subirlo.',
    };
  }

  return { ok: false, motivo: motivoGenerico(mimetype) };
}

/** Último recurso: el contenido no se reconoció, así que el mimetype orienta. */
function motivoGenerico(mimetype: string): string {
  const mime = (mimetype ?? '').toLowerCase().split(';')[0].trim();

  if (mime.startsWith('image/')) {
    return 'Es una imagen, no un documento. Si son fotos de páginas, no tienen texto seleccionable: subí el PDF o el DOCX original.';
  }
  if (mime.startsWith('video/') || mime.startsWith('audio/')) {
    return 'Es un archivo de audio o video. Solo se aceptan archivos PDF o DOCX.';
  }
  if (mime === 'text/plain' || mime === 'text/csv') {
    return 'Es un archivo de texto plano. Pegá el contenido a mano, o guardalo como PDF o DOCX.';
  }

  return 'Solo se aceptan archivos PDF o DOCX.';
}

/**
 * Un DOCX es un ZIP con una estructura conocida. Los nombres de las entradas
 * viajan en claro dentro del contenedor, así que alcanza con buscarlos: no hace
 * falta descomprimir para saber si es un Word, una hoja o una presentación.
 */
function reconocerZip(buffer: Buffer): Reconocimiento {
  if (buffer.includes('word/document.xml')) return { ok: true, formato: 'docx' };

  if (buffer.includes('xl/workbook.xml') || buffer.includes('xl/worksheets/')) {
    return {
      ok: false,
      motivo:
        'Es una hoja de cálculo (Excel), no un documento. ' +
        'Subí el informe en PDF o DOCX, o pegá el contenido a mano.',
    };
  }

  if (buffer.includes('ppt/presentation.xml') || buffer.includes('ppt/slides/')) {
    return {
      ok: false,
      motivo:
        'Es una presentación (PowerPoint), no un documento. ' +
        'Exportala a PDF y volvé a subirla.',
    };
  }

  return {
    ok: false,
    motivo: 'El archivo es un ZIP, pero no es un documento de Word. Solo se aceptan PDF o DOCX.',
  };
}

/**
 * Nombre presentable y sin sorpresas. No se usa para escribir nada en disco —
 * el archivo vive solo en memoria — pero sí se devuelve al front y se usa como
 * fallback del nombre del proyecto, así que no puede traer rutas ni controles.
 */
export function nombreSeguro(crudo: unknown): string {
  if (typeof crudo !== 'string') return 'documento';

  const base = crudo
    .split(/[/\\]/)
    .pop() // se queda con el último segmento: mata ../../etc/passwd
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!base || base === '.' || base === '..') return 'documento';
  return base.length > 120 ? base.slice(0, 120) : base;
}
