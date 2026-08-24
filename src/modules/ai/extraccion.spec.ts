/**
 * unpdf y mammoth van SIEMPRE mockeados acá, nunca los módulos reales.
 *
 * No es por velocidad: el subpath `./pdfjs` de unpdf solo expone la condición
 * `import`, así que su import() interno de ESM revienta bajo Jest en CommonJS.
 * Mockearlos también deja los casos de borde (PDF de 300 páginas, PDF escaneado)
 * como tests deterministas en vez de depender de tener esos archivos a mano.
 */
jest.mock('unpdf', () => ({
  getDocumentProxy: jest.fn(),
  extractText: jest.fn(),
}));
jest.mock('mammoth', () => ({
  extractRawText: jest.fn(),
}));

import * as mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { extraerTexto } from './extraccion';

const getDoc = getDocumentProxy as jest.MockedFunction<typeof getDocumentProxy>;
const extraer = extractText as jest.MockedFunction<typeof extractText>;
const rawText = mammoth.extractRawText as jest.MockedFunction<typeof mammoth.extractRawText>;

const LIMITES = { maxCaracteres: 24000, maxPaginasPdf: 40 };
const BUFFER = Buffer.from('irrelevante: los lectores están mockeados');

/** Texto largo y realista, por encima del mínimo útil de 200 caracteres. */
function textoLargo(veces = 20): string {
  return 'Las facturas de flete se auditan a mano y se pagan cobros duplicados. '.repeat(veces);
}

function pdfDe(paginas: number): { numPages: number } {
  return { numPages: paginas };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('extraerTexto · PDF', () => {
  it('devuelve el texto limpio con el conteo de páginas', async () => {
    getDoc.mockResolvedValue(pdfDe(3) as never);
    extraer.mockResolvedValue({ totalPages: 3, text: textoLargo() } as never);

    const salida = await extraerTexto(BUFFER, 'pdf', LIMITES);

    expect(salida.ok).toBe(true);
    if (!salida.ok) return;
    expect(salida.datos.paginas).toBe(3);
    expect(salida.datos.truncado).toBe(false);
    expect(salida.datos.caracteresLeidos).toBe(salida.datos.texto.length);
  });

  it('rechaza por exceso de páginas ANTES de extraer', async () => {
    // Sin worker, PDF.js corre en el event loop: 300 páginas bloquean el proceso.
    getDoc.mockResolvedValue(pdfDe(300) as never);

    const salida = await extraerTexto(BUFFER, 'pdf', LIMITES);

    expect(salida.ok).toBe(false);
    expect(salida.ok === false && salida.motivo).toContain('300 páginas');
    expect(extraer).not.toHaveBeenCalled();
  });

  it('explica qué hacer cuando el PDF es un escaneado sin capa de texto', async () => {
    getDoc.mockResolvedValue(pdfDe(12) as never);
    extraer.mockResolvedValue({ totalPages: 12, text: '   \n \n ' } as never);

    const salida = await extraerTexto(BUFFER, 'pdf', LIMITES);

    expect(salida.ok).toBe(false);
    expect(salida.ok === false && salida.motivo).toContain('escaneado');
    expect(salida.ok === false && salida.motivo).toContain('a mano');
  });

  it('trata el texto apenas por debajo del mínimo como ilegible', async () => {
    getDoc.mockResolvedValue(pdfDe(1) as never);
    extraer.mockResolvedValue({ totalPages: 1, text: 'x'.repeat(199) } as never);

    expect((await extraerTexto(BUFFER, 'pdf', LIMITES)).ok).toBe(false);
  });

  it('avisa cuando el PDF no se puede abrir, sin lanzar', async () => {
    getDoc.mockRejectedValue(new Error('InvalidPDFException'));

    const salida = await extraerTexto(BUFFER, 'pdf', LIMITES);

    expect(salida.ok).toBe(false);
    expect(salida.ok === false && salida.motivo).toContain('contraseña');
  });

  it('trunca en límite de párrafo y lo marca', async () => {
    getDoc.mockResolvedValue(pdfDe(5) as never);
    const parrafos = Array.from({ length: 60 }, (_, i) => `Parrafo ${i}. ${'texto '.repeat(30)}`).join('\n\n');
    extraer.mockResolvedValue({ totalPages: 5, text: parrafos } as never);

    const salida = await extraerTexto(BUFFER, 'pdf', { ...LIMITES, maxCaracteres: 1000 });

    expect(salida.ok).toBe(true);
    if (!salida.ok) return;
    expect(salida.datos.truncado).toBe(true);
    expect(salida.datos.texto.length).toBeLessThanOrEqual(1000);
  });

  it('acepta el texto por páginas además de la cadena única', async () => {
    getDoc.mockResolvedValue(pdfDe(2) as never);
    extraer.mockResolvedValue({ totalPages: 2, text: [textoLargo(10), textoLargo(10)] } as never);

    const salida = await extraerTexto(BUFFER, 'pdf', LIMITES);
    expect(salida.ok).toBe(true);
  });
});

describe('extraerTexto · DOCX', () => {
  it('devuelve el texto y no reporta páginas', async () => {
    rawText.mockResolvedValue({ value: textoLargo(), messages: [] } as never);

    const salida = await extraerTexto(BUFFER, 'docx', LIMITES);

    expect(salida.ok).toBe(true);
    if (!salida.ok) return;
    expect(salida.datos.paginas).toBeNull();
    expect(salida.datos.texto.length).toBeGreaterThan(200);
  });

  it('avisa cuando el Word no se puede leer, sin lanzar', async () => {
    rawText.mockRejectedValue(new Error('corrupto'));

    const salida = await extraerTexto(BUFFER, 'docx', LIMITES);

    expect(salida.ok).toBe(false);
    expect(salida.ok === false && salida.motivo).toContain('Word');
  });

  it('trata un Word casi vacío como ilegible en vez de mandarlo al modelo', async () => {
    rawText.mockResolvedValue({ value: 'Hola.', messages: [] } as never);

    expect((await extraerTexto(BUFFER, 'docx', LIMITES)).ok).toBe(false);
  });

  it('nunca llama al lector de PDF cuando el formato es docx', async () => {
    rawText.mockResolvedValue({ value: textoLargo(), messages: [] } as never);

    await extraerTexto(BUFFER, 'docx', LIMITES);

    expect(getDoc).not.toHaveBeenCalled();
    expect(extraer).not.toHaveBeenCalled();
  });
});
