import { detectarFormato, nombreSeguro } from './formato';

/** Arma un buffer que empieza con la firma dada y sigue con texto. */
function conFirma(firma: number[], resto = ''): Buffer {
  return Buffer.concat([Buffer.from(firma), Buffer.from(resto, 'latin1')]);
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

describe('detectarFormato', () => {
  it('reconoce un PDF normal', () => {
    expect(detectarFormato(Buffer.from('%PDF-1.7\nalgo'), 'application/pdf')).toEqual({
      ok: true,
      formato: 'pdf',
    });
  });

  it('reconoce un PDF con basura o BOM antes de la firma', () => {
    // Hay PDFs reales así y PDF.js los abre. Buscar solo en el offset 0 los
    // rechazaría por un problema que no tienen.
    const conBasura = Buffer.concat([Buffer.from('\ufeff// generado por X\n'), Buffer.from('%PDF-1.4\n')]);
    expect(detectarFormato(conBasura, 'application/pdf')).toEqual({ ok: true, formato: 'pdf' });
  });

  it('reconoce un DOCX por el contenido del contenedor', () => {
    const docx = conFirma(ZIP, 'ruido...word/document.xml...mas ruido');
    expect(detectarFormato(docx, '')).toEqual({ ok: true, formato: 'docx' });
  });

  it('acepta un DOCX con mimetype vacío u octet-stream, como lo manda el navegador', () => {
    const docx = conFirma(ZIP, 'word/document.xml');
    expect(detectarFormato(docx, '').ok).toBe(true);
    expect(detectarFormato(docx, 'application/octet-stream').ok).toBe(true);
  });

  it('decide por contenido, no por mimetype: un ZIP renombrado a .pdf se rechaza', () => {
    // El cliente elige el Content-Type de la parte multipart, así que renombrar
    // payload.zip a pliego.pdf produce application/pdf sin cambiar un byte.
    const zipCualquiera = conFirma(ZIP, 'payload/malicioso.exe');
    const salida = detectarFormato(zipCualquiera, 'application/pdf');
    expect(salida.ok).toBe(false);
    expect(salida.ok === false && salida.motivo).toContain('ZIP');
  });

  it('manda un mensaje propio para el .doc viejo, que es el error más común', () => {
    const salida = detectarFormato(conFirma(OLE2, 'algo'), 'application/msword');
    expect(salida.ok).toBe(false);
    // El mensaje tiene que decir qué hacer, no solo que no se puede.
    expect(salida.ok === false && salida.motivo).toContain('guardalo como .docx');
  });

  it('el mensaje del .doc gana sobre cualquier mimetype', () => {
    // Regresión: con la allowlist de mimetypes por delante, un .doc (que llega
    // como application/msword) comía el mensaje genérico y la persona no se
    // enteraba de que le alcanzaba con guardarlo como .docx.
    for (const mime of ['application/msword', 'application/pdf', '', 'application/octet-stream']) {
      const salida = detectarFormato(conFirma(OLE2, 'algo'), mime);
      expect(salida.ok === false && salida.motivo).toContain('guardalo como .docx');
    }
  });

  it('distingue una hoja de cálculo de un documento', () => {
    const xlsx = conFirma(ZIP, '[Content_Types].xml xl/workbook.xml');
    const salida = detectarFormato(xlsx, '');
    expect(salida.ok).toBe(false);
    expect(salida.ok === false && salida.motivo).toContain('hoja de cálculo');
  });

  it('distingue una presentación de un documento', () => {
    const pptx = conFirma(ZIP, 'ppt/presentation.xml');
    const salida = detectarFormato(pptx, '');
    expect(salida.ok).toBe(false);
    expect(salida.ok === false && salida.motivo).toContain('presentación');
  });

  it('rechaza el archivo vacío o casi vacío', () => {
    expect(detectarFormato(Buffer.alloc(0), 'application/pdf')).toEqual({
      ok: false,
      motivo: 'El archivo está vacío.',
    });
    expect(detectarFormato(Buffer.from('%PDF'), 'application/pdf').ok).toBe(false);
  });

  it('usa el mimetype solo cuando el contenido no dijo nada, para precisar el mensaje', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const salida = detectarFormato(png, 'image/png');
    expect(salida.ok).toBe(false);
    expect(salida.ok === false && salida.motivo).toContain('imagen');
  });

  it('rechaza binarios desconocidos aunque el mimetype sea aceptable', () => {
    const raro = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(detectarFormato(raro, 'application/octet-stream').ok).toBe(false);
  });
});

describe('nombreSeguro', () => {
  it('deja pasar un nombre normal', () => {
    expect(nombreSeguro('pliego-2026.pdf')).toBe('pliego-2026.pdf');
  });

  it('se queda con el último segmento: mata las rutas', () => {
    expect(nombreSeguro('../../etc/passwd')).toBe('passwd');
    expect(nombreSeguro('C:\\Users\\alguien\\informe.docx')).toBe('informe.docx');
  });

  it('quita los caracteres de control', () => {
    expect(nombreSeguro('inf\u0000or\u001fme.pdf')).toBe('informe.pdf');
  });

  it('cae en un nombre neutro cuando no queda nada usable', () => {
    expect(nombreSeguro('')).toBe('documento');
    expect(nombreSeguro('..')).toBe('documento');
    expect(nombreSeguro(null)).toBe('documento');
    expect(nombreSeguro(42)).toBe('documento');
  });

  it('acota el largo', () => {
    expect(nombreSeguro('x'.repeat(300)).length).toBe(120);
  });
});
