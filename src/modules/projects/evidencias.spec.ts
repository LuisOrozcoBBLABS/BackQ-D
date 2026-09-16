import { TipoEvidencia } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/project.dto';

/**
 * Las evidencias son enlaces externos: nada se sube, el dato es la URL. Este
 * spec cuida las dos cosas que se pueden romper sin que el compilador avise.
 *
 * 1. El reemplazo al editar. La guarda es sobre el campo y no sobre su
 *    longitud: un array vacío BORRA, un campo ausente NO TOCA. Si alguien la
 *    cambia a `?.length`, quitarle la última evidencia a un proyecto deja de
 *    ser posible y no falla nada — la petición responde 200 y la evidencia
 *    sigue ahí.
 *
 * 2. La validación del DTO. La URL termina pintada en un `href` de la ficha,
 *    así que se valida contra el DTO REAL y no contra una copia de sus reglas,
 *    igual que hace saneamiento.contrato.spec.ts con el borrador de la IA.
 */

const USER: RequestUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'alguien@bblabs.io',
  rol: 'admin',
  groupId: null,
  permisos: ['projects.create'],
  debeCambiarPassword: false,
};

const ID = '22222222-2222-4222-8222-222222222222';

type ArgsCapturados = {
  create: any[];
  evidenciaDelete: any[];
  evidenciaCreateMany: any[];
};

/** Prisma falso: guarda con qué lo llamaron. No hace falta base para esto. */
function prismaFalso() {
  const capturado: ArgsCapturados = { create: [], evidenciaDelete: [], evidenciaCreateMany: [] };

  const tx = {
    projectStatusChange: { create: jest.fn(() => Promise.resolve({})) },
    projectSimilar: {
      deleteMany: jest.fn(() => Promise.resolve({})),
      createMany: jest.fn(() => Promise.resolve({})),
    },
    projectEvidence: {
      deleteMany: jest.fn((args: unknown) => {
        capturado.evidenciaDelete.push(args);
        return Promise.resolve({});
      }),
      createMany: jest.fn((args: unknown) => {
        capturado.evidenciaCreateMany.push(args);
        return Promise.resolve({});
      }),
    },
    project: { update: jest.fn(() => Promise.resolve({ id: ID })) },
  };

  const prisma = {
    project: {
      create: jest.fn((args: unknown) => {
        capturado.create.push(args);
        return Promise.resolve({ id: ID });
      }),
      findUnique: jest.fn(() => Promise.resolve({ autorId: USER.id, estado: 'idea' })),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx))),
  } as unknown as PrismaService;

  return { prisma, capturado, tx };
}

const base = { nombre: 'Proyecto', sector: 'Logística' };

describe('evidencias: qué se escribe en la base', () => {
  it('al crear, numera el orden por la posición del array', async () => {
    const { prisma, capturado } = prismaFalso();
    const svc = new ProjectsService(prisma);

    await svc.create(
      {
        ...base,
        evidencias: [
          { tipo: TipoEvidencia.despliegue, titulo: 'La app', url: 'https://ejemplo.com' },
          { tipo: TipoEvidencia.video, titulo: 'Demo', url: 'https://ejemplo.com/demo' },
        ],
      } as CreateProjectDto,
      USER,
    );

    expect(capturado.create[0].data.evidencias.create).toEqual([
      { tipo: 'despliegue', titulo: 'La app', url: 'https://ejemplo.com', orden: 0 },
      { tipo: 'video', titulo: 'Demo', url: 'https://ejemplo.com/demo', orden: 1 },
    ]);
  });

  it('al crear sin evidencias no manda la clave, para no escribir una lista vacía', async () => {
    const { prisma, capturado } = prismaFalso();
    const svc = new ProjectsService(prisma);

    await svc.create({ ...base } as CreateProjectDto, USER);

    expect(capturado.create[0].data.evidencias).toBeUndefined();
  });

  it('al editar con un array vacío, BORRA las que había', async () => {
    const { prisma, capturado } = prismaFalso();
    const svc = new ProjectsService(prisma);

    await svc.update(ID, { evidencias: [] } as any, USER);

    expect(capturado.evidenciaDelete).toHaveLength(1);
    expect(capturado.evidenciaDelete[0]).toEqual({ where: { projectId: ID } });
    // Borra, pero no crea nada: es el caso de "quitar la última".
    expect(capturado.evidenciaCreateMany).toHaveLength(0);
  });

  it('al editar sin el campo, NO las toca', async () => {
    const { prisma, capturado } = prismaFalso();
    const svc = new ProjectsService(prisma);

    await svc.update(ID, { nombre: 'Otro nombre' } as any, USER);

    expect(capturado.evidenciaDelete).toHaveLength(0);
    expect(capturado.evidenciaCreateMany).toHaveLength(0);
  });

  it('al editar con evidencias, reemplaza todo y renumera', async () => {
    const { prisma, capturado } = prismaFalso();
    const svc = new ProjectsService(prisma);

    await svc.update(
      ID,
      {
        evidencias: [
          { tipo: TipoEvidencia.imagen, titulo: 'Captura', url: 'https://ejemplo.com/a.png' },
        ],
      } as any,
      USER,
    );

    expect(capturado.evidenciaDelete).toHaveLength(1);
    expect(capturado.evidenciaCreateMany[0].data).toEqual([
      {
        projectId: ID,
        tipo: 'imagen',
        titulo: 'Captura',
        url: 'https://ejemplo.com/a.png',
        orden: 0,
      },
    ]);
  });
});

/**
 * Contra el DTO importado, no contra una copia de sus reglas: el día que alguien
 * cambie un @MaxLength o la allowlist, esto se rompe acá y no en producción.
 */
describe('contrato: qué acepta el CreateProjectDto real', () => {
  const validar = (evidencias: unknown) => {
    const dto = plainToInstance(CreateProjectDto, { ...base, evidencias });
    return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  };

  const ok = { tipo: 'despliegue', titulo: 'La app', url: 'https://ejemplo.com' };

  const HOSTILES: { caso: string; evidencias: unknown }[] = [
    { caso: 'javascript: sería XSS servido por nuestra propia API', evidencias: [{ ...ok, url: 'javascript:alert(1)' }] },
    { caso: 'data: idem', evidencias: [{ ...ok, url: 'data:text/html,<script>alert(1)</script>' }] },
    { caso: 'ftp:, que el @IsUrl() pelado sí acepta', evidencias: [{ ...ok, url: 'ftp://ejemplo.com/a.png' }] },
    { caso: 'un dominio suelto sin esquema', evidencias: [{ ...ok, url: 'ejemplo.com' }] },
    { caso: 'una URL de 600 caracteres', evidencias: [{ ...ok, url: `https://ejemplo.com/${'a'.repeat(600)}` }] },
    { caso: 'un título de 200 caracteres', evidencias: [{ ...ok, titulo: 'a'.repeat(200) }] },
    { caso: 'un tipo que no está en el enum', evidencias: [{ ...ok, tipo: 'audio' }] },
    { caso: 'trece evidencias, una más que el tope', evidencias: Array.from({ length: 13 }, () => ok) },
    { caso: 'un ítem que no es un objeto', evidencias: ['https://ejemplo.com'] },
    { caso: 'una clave de más en el ítem', evidencias: [{ ...ok, archivo: 'x' }] },
  ];

  for (const { caso, evidencias } of HOSTILES) {
    it(`rechaza: ${caso}`, () => {
      expect(validar(evidencias).length).toBeGreaterThan(0);
    });
  }

  it('acepta las cuatro clases de evidencia', () => {
    const evidencias = (['imagen', 'video', 'despliegue', 'documento'] as const).map(tipo => ({
      tipo,
      titulo: `Evidencia ${tipo}`,
      url: 'https://ejemplo.com/x',
    }));

    expect(validar(evidencias)).toEqual([]);
  });

  it('acepta doce, que es el tope exacto', () => {
    expect(validar(Array.from({ length: 12 }, () => ok))).toEqual([]);
  });

  it('acepta que no haya evidencias', () => {
    expect(validar(undefined)).toEqual([]);
  });
});
