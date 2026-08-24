import { GeminiService } from './gemini.service';
import { PeticionIA } from './proveedor';

/**
 * El servicio lee process.env directo (convención del repo: nadie inyecta
 * ConfigService), así que guardar y restaurar el entorno acá es obligatorio: sin
 * eso un test le cambia la configuración al siguiente.
 */
const ENV_ORIGINAL = process.env;

const PETICION: PeticionIA = {
  instruccionSistema: 'sos un analista',
  prompt: 'documento',
  esquema: { type: 'object' },
};

function respuesta(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

let servicio: GeminiService;

beforeEach(() => {
  process.env = { ...ENV_ORIGINAL, GEMINI_API_KEY: 'clave-de-prueba', GEMINI_MODEL: 'gemini-2.5-flash' };
  global.fetch = jest.fn();
  servicio = new GeminiService();
  jest.spyOn(servicio['logger'], 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  process.env = ENV_ORIGINAL;
  jest.restoreAllMocks();
});

describe('GeminiService · configuración', () => {
  it('no está configurado sin la clave', () => {
    delete process.env.GEMINI_API_KEY;
    expect(new GeminiService().configurado).toBe(false);
  });

  it('el modelo sale del entorno y nunca está hardcodeado', () => {
    process.env.GEMINI_MODEL = 'gemini-3-pro';
    expect(new GeminiService().modelo).toBe('gemini-3-pro');
  });

  it('responde sin llamar al proveedor cuando falta la clave', async () => {
    delete process.env.GEMINI_API_KEY;
    const salida = await new GeminiService().generarJson(PETICION);

    expect(salida.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('GeminiService · la clave nunca viaja en la URL', () => {
  it('manda la key en el header x-goog-api-key y no en la query', async () => {
    // Una key en la URL termina en logs de acceso, proxies y mensajes de error.
    (global.fetch as jest.Mock).mockResolvedValue(
      respuesta({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }),
    );

    await servicio.generarJson(PETICION);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('clave-de-prueba');
    expect(url).not.toContain('key=');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('clave-de-prueba');
  });

  it('pide JSON con el esquema y temperatura baja', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      respuesta({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
    );

    await servicio.generarJson(PETICION);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const cuerpo = JSON.parse(init.body as string) as Record<string, any>;
    expect(cuerpo.generationConfig.responseMimeType).toBe('application/json');
    expect(cuerpo.generationConfig.responseSchema).toEqual({ type: 'object' });
    expect(cuerpo.generationConfig.candidateCount).toBe(1);
  });
});

describe('GeminiService · lectura de la respuesta', () => {
  it('concatena las partes de texto y descarta las de razonamiento', async () => {
    // Los modelos 2.5+ mezclan partes con thought:true, que no son la respuesta.
    (global.fetch as jest.Mock).mockResolvedValue(
      respuesta({
        candidates: [
          {
            content: {
              parts: [
                { text: 'pensando en voz alta', thought: true },
                { text: '{"nombre":' },
                { text: '"X"}' },
              ],
            },
          },
        ],
        usageMetadata: { totalTokenCount: 1234 },
      }),
    );

    const salida = await servicio.generarJson(PETICION);

    expect(salida.ok).toBe(true);
    if (!salida.ok) return;
    expect(salida.texto).toBe('{"nombre":"X"}');
    expect(salida.tokens).toBe(1234);
    expect(salida.modelo).toBe('gemini-2.5-flash');
  });

  it('no asume parts[0]: si la primera parte es razonamiento igual encuentra el texto', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      respuesta({
        candidates: [{ content: { parts: [{ thought: true, text: 'x' }, { text: '{"ok":1}' }] } }],
      }),
    );

    const salida = await servicio.generarJson(PETICION);
    expect(salida.ok === true && salida.texto).toBe('{"ok":1}');
  });

  it('trata el bloqueo por filtros de seguridad como definitivo', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(respuesta({ promptFeedback: { blockReason: 'SAFETY' } }));

    const salida = await servicio.generarJson(PETICION);

    expect(salida).toEqual({
      ok: false,
      motivo: 'El documento fue rechazado por los filtros de seguridad del modelo.',
      reintentable: false,
    });
  });

  it('explica el corte por MAX_TOKENS y no lo reintenta', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      respuesta({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"a' }] } }] }),
    );

    const salida = await servicio.generarJson(PETICION);

    expect(salida.ok).toBe(false);
    expect(salida.ok === false && salida.reintentable).toBe(false);
    expect(salida.ok === false && salida.motivo).toContain('documento más corto');
  });

  it('avisa cuando no hay candidatos ni texto', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(respuesta({ candidates: [] }));
    expect((await servicio.generarJson(PETICION)).ok).toBe(false);

    (global.fetch as jest.Mock).mockResolvedValue(
      respuesta({ candidates: [{ content: { parts: [{ text: '   ' }] } }] }),
    );
    expect((await servicio.generarJson(PETICION)).ok).toBe(false);
  });
});

describe('GeminiService · clasificación de errores', () => {
  it('429 y 5xx son reintentables', async () => {
    for (const status of [429, 500, 503]) {
      (global.fetch as jest.Mock).mockResolvedValue(respuesta({ error: { code: status } }, status));
      const salida = await servicio.generarJson(PETICION);
      expect(salida.ok === false && salida.reintentable).toBe(true);
    }
  });

  it('403 no es reintentable y habla de la clave', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      respuesta({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'no' } }, 403),
    );

    const salida = await servicio.generarJson(PETICION);

    expect(salida.ok === false && salida.reintentable).toBe(false);
    expect(salida.ok === false && salida.motivo).toContain('clave');
  });

  it('404 menciona GEMINI_MODEL, que es lo que hay que corregir', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(respuesta({ error: { code: 404 } }, 404));

    const salida = await servicio.generarJson(PETICION);

    expect(salida.ok === false && salida.motivo).toContain('GEMINI_MODEL');
    expect(salida.ok === false && salida.reintentable).toBe(false);
  });

  it('la red caída es reintentable', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    const salida = await servicio.generarJson(PETICION);

    expect(salida.ok === false && salida.reintentable).toBe(true);
    expect(salida.ok === false && salida.motivo).toContain('Sin conexión');
  });

  it('el timeout es reintentable y dice cuántos segundos esperó', async () => {
    process.env.AI_TIMEOUT_MS = '5000';
    const conTimeout = new GeminiService();
    const error = new Error('abortado');
    error.name = 'TimeoutError';
    (global.fetch as jest.Mock).mockRejectedValue(error);

    const salida = await conTimeout.generarJson(PETICION);

    expect(salida.ok === false && salida.reintentable).toBe(true);
    expect(salida.ok === false && salida.motivo).toContain('5 segundos');
  });

  it('nunca lanza, pase lo que pase', async () => {
    const hostiles = [
      () => Promise.reject(new Error('boom')),
      () => Promise.resolve(respuesta(null)),
      () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('no es json')), text: async () => '' } as unknown as Response),
      () => Promise.reject('un string pelado'),
    ];

    for (const escenario of hostiles) {
      (global.fetch as jest.Mock).mockImplementation(escenario);
      await expect(servicio.generarJson(PETICION)).resolves.toBeDefined();
    }
  });
});
