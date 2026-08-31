jest.mock('unpdf', () => ({ getDocumentProxy: jest.fn(), extractText: jest.fn() }));
jest.mock('mammoth', () => ({ extractRawText: jest.fn() }));

import { BadGatewayException, BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { RequestUser } from '../../common/types/request-user';
import { ArchivoSubido, BorradoresService } from './borradores.service';
import { PeticionIA, ProveedorIA, RespuestaIA } from './proveedor';

const rawText = mammoth.extractRawText as jest.MockedFunction<typeof mammoth.extractRawText>;

const USER: RequestUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'alguien@bblabs.io',
  rol: 'colaborador',
  groupId: null,
  permisos: ['ai.use'],
  debeCambiarPassword: false,
};

/** Marcador plantado en el documento: si aparece en un log, hay una fuga. */
const MARCADOR = 'SECRETO-QUE-NO-DEBE-APARECER-EN-EL-LOG';
const NOMBRE_ARCHIVO = 'Acta despido Juan Perez.docx';

/** DOCX válido para el detector: ZIP con la entrada de Word. */
function docx(nombre = NOMBRE_ARCHIVO): ArchivoSubido {
  const buffer = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('word/document.xml'),
  ]);
  return { originalname: nombre, mimetype: '', size: buffer.length, buffer };
}

function textoDelDocumento(): string {
  return `${MARCADOR}. Las facturas de flete se auditan a mano y se pagan cobros duplicados. `.repeat(6);
}

const BORRADOR_OK = JSON.stringify({
  nombre: 'FreightAudit',
  sector: 'Logística',
  problema: 'Auditoría manual de fletes.',
  dolores: 'Cobros duplicados.',
  solucion: 'Cotejo automático contra la tarifa.',
  plusIA: 'Detección de anomalías.',
  similares: [{ name: 'Reveel', url: 'https://reveelgroup.com' }],
});

/** Proveedor falso: el servicio no conoce Gemini, así que esto es suficiente. */
class ProveedorFalso implements ProveedorIA {
  readonly nombre = 'falso';
  readonly modelo = 'modelo-falso';
  llamadas: PeticionIA[] = [];

  constructor(
    public configurado = true,
    private readonly respuestas: RespuestaIA[] = [
      { ok: true, texto: BORRADOR_OK, modelo: 'modelo-falso', tokens: 900 },
    ],
  ) {}

  generarJson(p: PeticionIA): Promise<RespuestaIA> {
    this.llamadas.push(p);
    const i = Math.min(this.llamadas.length - 1, this.respuestas.length - 1);
    return Promise.resolve(this.respuestas[i]);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  rawText.mockResolvedValue({ value: textoDelDocumento(), messages: [] } as never);
});

describe('BorradoresService', () => {
  it('devuelve el borrador con los metadatos como hermanos, no adentro', async () => {
    const servicio = new BorradoresService(new ProveedorFalso());

    const salida = await servicio.desdeDocumento(docx(), {}, USER);

    // Esta forma es la que evita el 400: {...salida.borrador} es el CreateProjectDto.
    expect(Object.keys(salida.borrador).sort()).toEqual([
      'dolores',
      'nombre',
      'plusIA',
      'problema',
      'sector',
      'similares',
      'solucion',
    ]);
    expect(salida.origen.formato).toBe('docx');
    expect(salida.origen.archivo).toBe(NOMBRE_ARCHIVO);
    expect(salida.modelo).toBe('modelo-falso');
  });

  it('responde 503 sin llamar al proveedor cuando el motor está apagado', async () => {
    const proveedor = new ProveedorFalso(false);
    const servicio = new BorradoresService(proveedor);

    await expect(servicio.desdeDocumento(docx(), {}, USER)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(proveedor.llamadas).toHaveLength(0);
    // Ni se molesta en extraer el texto: no hay nada que hacer con él.
    expect(rawText).not.toHaveBeenCalled();
  });

  it('responde 400 cuando falta el archivo', async () => {
    const servicio = new BorradoresService(new ProveedorFalso());
    await expect(servicio.desdeDocumento(undefined, {}, USER)).rejects.toThrow(BadRequestException);
  });

  it('responde 400 por formato, sin llamar al proveedor', async () => {
    const proveedor = new ProveedorFalso();
    const servicio = new BorradoresService(proveedor);
    const png: ArchivoSubido = {
      originalname: 'foto.png',
      mimetype: 'image/png',
      size: 10,
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]),
    };

    await expect(servicio.desdeDocumento(png, {}, USER)).rejects.toThrow(BadRequestException);
    expect(proveedor.llamadas).toHaveLength(0);
  });

  it('responde 400 y no gasta cuota con un documento sin texto legible', async () => {
    rawText.mockResolvedValue({ value: 'Hola.', messages: [] } as never);
    const proveedor = new ProveedorFalso();
    const servicio = new BorradoresService(proveedor);

    await expect(servicio.desdeDocumento(docx(), {}, USER)).rejects.toThrow(BadRequestException);
    expect(proveedor.llamadas).toHaveLength(0);
  });

  it('responde 502 cuando el modelo devuelve algo inservible', async () => {
    const servicio = new BorradoresService(
      new ProveedorFalso(true, [
        { ok: true, texto: 'lo siento, no puedo ayudarte con eso', modelo: 'm' },
      ]),
    );

    await expect(servicio.desdeDocumento(docx(), {}, USER)).rejects.toThrow(BadGatewayException);
  });

  it('reintenta una sola vez cuando el fallo es transitorio', async () => {
    // Una sola key para todo el backend: insistir contra un 429 le quema la
    // cuota al resto del equipo.
    const proveedor = new ProveedorFalso(true, [
      { ok: false, motivo: 'saturado', reintentable: true },
      { ok: true, texto: BORRADOR_OK, modelo: 'modelo-falso' },
    ]);
    const servicio = new BorradoresService(proveedor);

    const salida = await servicio.desdeDocumento(docx(), {}, USER);

    expect(proveedor.llamadas).toHaveLength(2);
    expect(salida.borrador.nombre).toBe('FreightAudit');
  });

  it('no reintenta cuando el fallo es definitivo', async () => {
    const proveedor = new ProveedorFalso(true, [
      { ok: false, motivo: 'La clave de la API de IA fue rechazada.', reintentable: false },
    ]);
    const servicio = new BorradoresService(proveedor);

    await expect(servicio.desdeDocumento(docx(), {}, USER)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(proveedor.llamadas).toHaveLength(1);
  });

  it('se rinde tras el reintento y responde 503 con el motivo del proveedor', async () => {
    const proveedor = new ProveedorFalso(true, [
      { ok: false, motivo: 'El servicio de IA está saturado. Probá de nuevo en un minuto.', reintentable: true },
    ]);
    const servicio = new BorradoresService(proveedor);

    await expect(servicio.desdeDocumento(docx(), {}, USER)).rejects.toThrow(/saturado/);
    expect(proveedor.llamadas).toHaveLength(2);
  });

  it('avisa cuando el documento se truncó, arriba de todo', async () => {
    process.env.AI_MAX_CARACTERES = '300';
    const servicio = new BorradoresService(new ProveedorFalso());

    const salida = await servicio.desdeDocumento(docx(), {}, USER);

    expect(salida.origen.truncado).toBe(true);
    expect(salida.avisos[0]).toContain('muy largo');
    delete process.env.AI_MAX_CARACTERES;
  });

  it('pasa el contexto que escribió la persona al prompt', async () => {
    const proveedor = new ProveedorFalso();
    const servicio = new BorradoresService(proveedor);

    await servicio.desdeDocumento(docx(), { contexto: 'Es un pliego de transporte' }, USER);

    expect(proveedor.llamadas[0].prompt).toContain('Es un pliego de transporte');
  });

  it('el documento viaja como dato delimitado, no como instrucciones', async () => {
    const proveedor = new ProveedorFalso();
    const servicio = new BorradoresService(proveedor);

    await servicio.desdeDocumento(docx(), {}, USER);

    expect(proveedor.llamadas[0].prompt).toContain('<documento>');
    expect(proveedor.llamadas[0].instruccionSistema).toContain('DATO');
  });
});

/**
 * Este describe convierte la política de logs del plan (A9) en algo que se rompe
 * si alguien agrega un log de debug con el texto o el nombre del archivo.
 */
describe('BorradoresService · privacidad de los logs', () => {
  it('no logea el texto del documento, el prompt, la respuesta ni el nombre del archivo', async () => {
    const escritos: string[] = [];
    const recoger = (m: unknown): undefined => {
      escritos.push(String(m));
      return undefined;
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(recoger);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(recoger);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(recoger);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(recoger);

    const servicio = new BorradoresService(new ProveedorFalso());
    await servicio.desdeDocumento(docx(), { contexto: 'contexto que tampoco va al log' }, USER);

    const todo = escritos.join('\n');
    expect(escritos.length).toBeGreaterThan(0); // que algo se logee, si no el test no prueba nada
    expect(todo).not.toContain(MARCADOR);
    expect(todo).not.toContain('Juan Perez');
    expect(todo).not.toContain(NOMBRE_ARCHIVO);
    expect(todo).not.toContain('FreightAudit');
    expect(todo).not.toContain('contexto que tampoco va al log');
    expect(todo).not.toContain('<documento>');

    // Y sí logea lo que sirve para operar: el usuario y las métricas.
    expect(todo).toContain(USER.id);
    expect(todo).toContain('formato=docx');
    expect(todo).toContain('tokens=900');

    jest.restoreAllMocks();
  });
});
