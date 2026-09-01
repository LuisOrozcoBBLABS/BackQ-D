import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { ProjectsService } from './projects.service';
import { QueryProjectsDto } from './dto/query-projects.dto';

/**
 * Lo que este spec cuida es el armado del `where`, no Prisma.
 *
 * El filtro de prestación tiene un valor —`sin_clasificar`— que NO existe en el
 * enum de la base: es la forma de pedir `tipoPrestacion IS NULL`. Si alguien lo
 * pasa tal cual al `where`, Prisma lanza un PrismaClientValidationError que el
 * filtro de excepciones no traduce, así que la persona ve un 500 en vez de una
 * lista. Es un fallo de runtime que el compilador no puede ver, porque el valor
 * viaja como string desde el cliente. De ahí que se clave acá.
 *
 * El Prisma falso solo captura los argumentos: no hace falta base para
 * comprobar qué consulta se habría hecho.
 */

const USER: RequestUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'alguien@bblabs.io',
  rol: 'admin',
  groupId: null,
  permisos: ['projects.viewAll', 'projects.create'],
  debeCambiarPassword: false,
};

/** Prisma falso: guarda con qué lo llamaron y devuelve lo mínimo viable. */
function prismaFalso() {
  const capturado = {
    findMany: [] as Prisma.ProjectFindManyArgs[],
    count: [] as Prisma.ProjectCountArgs[],
    create: [] as Prisma.ProjectCreateArgs[],
  };
  const prisma = {
    project: {
      findMany: jest.fn((args: Prisma.ProjectFindManyArgs) => {
        capturado.findMany.push(args);
        return Promise.resolve([]);
      }),
      count: jest.fn((args: Prisma.ProjectCountArgs) => {
        capturado.count.push(args);
        return Promise.resolve(0);
      }),
      create: jest.fn((args: Prisma.ProjectCreateArgs) => {
        capturado.create.push(args);
        return Promise.resolve({ id: 'p1' });
      }),
    },
  } as unknown as PrismaService;

  return { prisma, capturado };
}

/**
 * El `where` es un AND de trozos, muchos vacíos. Esto busca el trozo que habla
 * de una clave concreta, para no depender de en qué posición quedó.
 */
function trozoCon(
  where: Prisma.ProjectWhereInput | undefined,
  clave: keyof Prisma.ProjectWhereInput,
): Prisma.ProjectWhereInput | undefined {
  const partes = (where?.AND ?? []) as Prisma.ProjectWhereInput[];
  return partes.find(p => clave in p);
}

describe('ProjectsService · filtro de tipo de prestación', () => {
  it('traduce sin_clasificar a null, y no lo manda crudo', async () => {
    const { prisma, capturado } = prismaFalso();
    const service = new ProjectsService(prisma);

    await service.findAll({ tipoPrestacion: 'sin_clasificar' } as QueryProjectsDto, USER);

    const trozo = trozoCon(capturado.findMany[0].where, 'tipoPrestacion');
    expect(trozo).toEqual({ tipoPrestacion: null });
    // El valor del filtro no puede llegar a la base: no existe en el enum.
    expect(JSON.stringify(capturado.findMany[0].where)).not.toContain('sin_clasificar');
  });

  it('pasa talento y solucion tal cual', async () => {
    for (const valor of ['talento', 'solucion'] as const) {
      const { prisma, capturado } = prismaFalso();
      const service = new ProjectsService(prisma);

      await service.findAll({ tipoPrestacion: valor } as QueryProjectsDto, USER);

      expect(trozoCon(capturado.findMany[0].where, 'tipoPrestacion')).toEqual({
        tipoPrestacion: valor,
      });
    }
  });

  it('sin filtro no toca la clave: undefined no es lo mismo que null', async () => {
    const { prisma, capturado } = prismaFalso();
    const service = new ProjectsService(prisma);

    await service.findAll({}, USER);

    // Con `{ tipoPrestacion: null }` acá, la lista mostraría SOLO los sin
    // clasificar cuando nadie pidió filtrar nada.
    expect(trozoCon(capturado.findMany[0].where, 'tipoPrestacion')).toBeUndefined();
  });

  it('el conteo usa el mismo filtro que la lista', async () => {
    const { prisma, capturado } = prismaFalso();
    const service = new ProjectsService(prisma);
    const q = { tipoPrestacion: 'talento' } as QueryProjectsDto;

    await service.findAll(q, USER);
    await service.contar(q, USER);

    // Si se desalinean, el número del encabezado deja de cuadrar con las filas.
    expect(capturado.count[0].where).toEqual(capturado.findMany[0].where);
  });
});

describe('ProjectsService · cliente', () => {
  it('la búsqueda libre incluye el cliente', async () => {
    const { prisma, capturado } = prismaFalso();
    const service = new ProjectsService(prisma);

    await service.findAll({ q: 'bancolombia' } as QueryProjectsDto, USER);

    const trozo = trozoCon(capturado.findMany[0].where, 'OR');
    const campos = ((trozo?.OR ?? []) as Prisma.ProjectWhereInput[]).flatMap(o => Object.keys(o));
    expect(campos).toEqual(['nombre', 'cliente', 'problema', 'solucion']);
  });

  it('al crear sin cliente ni tipo guarda null en los dos, no undefined', async () => {
    const { prisma, capturado } = prismaFalso();
    const service = new ProjectsService(prisma);

    await service.create({ nombre: 'FreightAudit', sector: 'Logística' }, USER);

    const data = capturado.create[0].data as Prisma.ProjectUncheckedCreateInput;
    // El cliente vacío se guarda NULL y no '': "sin cliente" y "cliente en
    // blanco" son el mismo hecho, y dos representaciones para lo mismo obligan
    // a cualquier filtro futuro a preguntar por las dos.
    expect(data.cliente).toBeNull();
    expect(data.tipoPrestacion).toBeNull();
  });

  it('un cliente en blanco tambien se guarda como null', async () => {
    const { prisma, capturado } = prismaFalso();
    const service = new ProjectsService(prisma);

    await service.create({ nombre: 'FreightAudit', sector: 'Logística', cliente: '   ' }, USER);

    const data = capturado.create[0].data as Prisma.ProjectUncheckedCreateInput;
    expect(data.cliente).toBeNull();
  });

  it('al crear con los dos campos los guarda recortados', async () => {
    const { prisma, capturado } = prismaFalso();
    const service = new ProjectsService(prisma);

    await service.create(
      { nombre: 'FreightAudit', sector: 'Logística', cliente: '  Bancolombia  ', tipoPrestacion: 'talento' },
      USER,
    );

    const data = capturado.create[0].data as Prisma.ProjectUncheckedCreateInput;
    expect(data.cliente).toBe('Bancolombia');
    expect(data.tipoPrestacion).toBe('talento');
  });
});
