import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { CreateProjectDto, SaveAiResultDto, UpdateProjectDto } from './dto/project.dto';
import { ORDEN_PROYECTOS, OrdenProyectos, QueryProjectsDto } from './dto/query-projects.dto';

const PROJECT_INCLUDE = {
  similares: { orderBy: { orden: 'asc' } },
  autor: { select: { id: true, nombre: true, email: true, avatarUrl: true } },
  group: { select: { id: true, nombre: true } },
  _count: { select: { assignments: true } },
  /// Solo la ultima: la tarjeta del tablero necesita saber desde cuando esta en
  /// su etapa, y traer el historial completo de cada fila seria caro.
  historial: {
    take: 1,
    orderBy: { createdAt: 'desc' },
    select: { estado: true, anterior: true, createdAt: true },
  },
  /// Quienes lo tienen a cargo. La tarjeta del tablero muestra el responsable,
  /// que no es el autor: el autor registro la idea, el responsable la ejecuta.
  assignments: {
    take: 3,
    orderBy: { createdAt: 'desc' },
    select: { asignadoA: { select: { id: true, nombre: true } } },
  },
} satisfies Prisma.ProjectInclude;

/// El detalle si trae el historial completo, con quien movio cada etapa.
const PROJECT_INCLUDE_DETALLE = {
  ...PROJECT_INCLUDE,
  historial: {
    orderBy: { createdAt: 'asc' },
    include: { por: { select: { id: true, nombre: true } } },
  },
  /// Con la fecha limite: el panel de detalle muestra el fin estimado, que el
  /// proyecto no tiene como campo propio y sale de sus asignaciones.
  assignments: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      estado: true,
      prioridad: true,
      fechaLimite: true,
      asignadoA: { select: { id: true, nombre: true } },
    },
  },
} satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Visibilidad: con projects.viewAll se ve todo. Sin ese permiso, cada persona ve
   * los propios y los de su grupo. Se decide en el servidor, no en el front.
   */
  /**
   * El mismo predicado de visibilidad, para otros modulos. Existe porque
   * asignar un proyecto que no podes ver te da acceso de lectura a el por la
   * via de la asignacion: quien crea una asignacion tiene que comprobar el
   * alcance con ESTE predicado, no con una copia que se desincronice.
   */
  alcanceDe(user: RequestUser): Prisma.ProjectWhereInput {
    return this.alcance(user);
  }

  private alcance(user: RequestUser): Prisma.ProjectWhereInput {
    if (user.permisos.includes('projects.viewAll')) return {};
    return {
      OR: [
        { autorId: user.id },
        // Si te asignaron el trabajo, podés ver el proyecto: sin esto, una
        // asignación de otro grupo era invisible para quien tiene que hacerla.
        { assignments: { some: { asignadoAId: user.id } } },
        ...(user.groupId ? [{ groupId: user.groupId }] : []),
      ],
    };
  }

  /**
   * Condiciones sobre las asignaciones del proyecto. Todas las que se pidan
   * tienen que cumplirse en la MISMA asignacion: pedir "urgente" y "asignado a
   * mi" no puede resolverse con una urgente de otra persona mas una mia
   * tranquila. Por eso van juntas dentro de un solo `some`.
   */
  private filtroAsignaciones(q: QueryProjectsDto, user: RequestUser): Prisma.ProjectWhereInput {
    const cond: Prisma.AssignmentWhereInput = {};
    if (q.asignadoAMi) cond.asignadoAId = user.id;
    if (q.asignadoA) cond.asignadoAId = q.asignadoA;
    if (q.asignadoPor) cond.asignadoPorId = q.asignadoPor;
    if (q.prioridad) cond.prioridad = q.prioridad;
    if (q.estadoAsignacion) cond.estado = q.estadoAsignacion;
    if (q.vencidos) {
      // Vencido = con plazo pasado y sin cerrar. Una completada tarde ya no urge.
      cond.fechaLimite = { lt: new Date() };
      cond.estado = q.estadoAsignacion ?? { not: 'completada' };
    }

    const filtros: Prisma.ProjectWhereInput[] = [];
    if (Object.keys(cond).length) filtros.push({ assignments: { some: cond } });
    if (q.sinAsignar) filtros.push({ assignments: { none: {} } });
    return filtros.length ? { AND: filtros } : {};
  }

  /** Rango de fechas de registro. Extremos inclusivos. */
  private filtroFechas(q: QueryProjectsDto): Prisma.ProjectWhereInput {
    if (!q.desde && !q.hasta) return {};
    const rango: Prisma.DateTimeFilter = {};
    if (q.desde) rango.gte = new Date(q.desde);
    if (q.hasta) {
      // "hasta el 20" incluye todo el 20, no corta a medianoche.
      const fin = new Date(q.hasta);
      fin.setHours(23, 59, 59, 999);
      rango.lte = fin;
    }
    return { createdAt: rango };
  }

  /** Filtros comunes a la lista y al conteo, para que nunca se desalineen. */
  private filtros(q: QueryProjectsDto, user: RequestUser): Prisma.ProjectWhereInput {
    return {
      AND: [
        this.alcance(user),
        q.archivados ? {} : { archivado: false },
        q.sector ? { sector: q.sector } : {},
        q.estado ? { estado: q.estado } : {},
        q.groupId ? { groupId: q.groupId } : {},
        this.filtroAsignaciones(q, user),
        this.filtroFechas(q),
        q.q
          ? {
              OR: [
                { nombre: { contains: q.q, mode: 'insensitive' as const } },
                // Buscar por cliente es lo primero que va a hacer el equipo
                // comercial. La columna es de 140 caracteres, mucho mas barata
                // de escanear que problema y solucion, que admiten 4000.
                { cliente: { contains: q.q, mode: 'insensitive' as const } },
                { problema: { contains: q.q, mode: 'insensitive' as const } },
                { solucion: { contains: q.q, mode: 'insensitive' as const } },
              ],
            }
          : {},
      ],
    };
  }

  /** Total que cumple los filtros. La paginacion necesita saberlo. */
  contar(q: QueryProjectsDto, user: RequestUser): Promise<number> {
    return this.prisma.project.count({ where: this.filtros(q, user) });
  }

  /**
   * Cuantos hay en cada estado dentro del alcance de la persona, sin los filtros
   * de estado: alimenta las pastillas, que tienen que seguir mostrando el total
   * de cada uno aunque haya un filtro puesto.
   */
  async porEstado(q: QueryProjectsDto, user: RequestUser): Promise<Record<string, number>> {
    const sinEstado: QueryProjectsDto = { ...q, estado: undefined };
    const grupos = await this.prisma.project.groupBy({
      by: ['estado'],
      where: this.filtros(sinEstado, user),
      _count: { _all: true },
    });

    const conteo: Record<string, number> = { total: 0 };
    for (const g of grupos) {
      conteo[g.estado] = g._count._all;
      conteo['total'] += g._count._all;
    }
    return conteo;
  }

  /**
   * Orden de la lista, con dos garantias que el DTO por si solo no da.
   *
   * La lista blanca se revalida ACA y no solo en el DTO: el tipo de TypeScript
   * no existe en runtime, asi que cualquier camino que no pase por el pipe
   * global (un job, un export, un test que llame al servicio con un objeto
   * plano) meteria en `orderBy` lo que le pasen. Es el mismo doble cinturon
   * que ya tiene `take` con su Math.min.
   *
   * Y el desempate por id hace determinista la paginacion: ningun campo
   * ordenable es unico, y sin desempate PostgreSQL puede devolver una
   * permutacion distinta en cada consulta, con filas repetidas entre paginas y
   * filas que no aparecen en ninguna. Con `estado` —10 valores posibles— casi
   * todas las filas estan empatadas y paginar seria practicamente aleatorio.
   */
  private orden(q: QueryProjectsDto): Prisma.ProjectOrderByWithRelationInput[] {
    const campo: OrdenProyectos = ORDEN_PROYECTOS.includes(q.sort as OrdenProyectos)
      ? (q.sort as OrdenProyectos)
      : 'createdAt';
    const sentido: Prisma.SortOrder = q.dir === 'asc' ? 'asc' : 'desc';
    return [{ [campo]: sentido }, { id: 'asc' }];
  }

  findAll(q: QueryProjectsDto, user: RequestUser) {
    return this.prisma.project.findMany({
      where: this.filtros(q, user),
      include: PROJECT_INCLUDE,
      // El defecto sigue siendo lo mas reciente primero: es lo que la mayoria
      // necesita al entrar, y un buen defecto ahorra mas que cualquier filtro.
      orderBy: this.orden(q),
      skip: q.skip ?? 0,
      take: Math.min(q.take ?? 50, 200),
    });
  }

  async findOne(id: string, user: RequestUser) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: PROJECT_INCLUDE_DETALLE,
    });
    if (!project) throw new NotFoundException('El proyecto no existe.');

    // Mismo criterio que `alcance()`, incluida la asignación propia: si el
    // proyecto aparece en tu tablero, su detalle no puede darte 403.
    const puedeVer =
      user.permisos.includes('projects.viewAll') ||
      project.autorId === user.id ||
      project.assignments.some(a => a.asignadoA?.id === user.id) ||
      (project.groupId !== null && project.groupId === user.groupId);
    if (!puedeVer) throw new ForbiddenException('Este proyecto no es tuyo ni de tu grupo.');

    return project;
  }

  create(dto: CreateProjectDto, user: RequestUser) {
    return this.prisma.project.create({
      data: {
        // La primera entrada de etapa nace con el proyecto: sin ella no se
        // podria saber desde cuando esta en su etapa inicial.
        historial: { create: { estado: dto.estado ?? 'idea', porId: user.id } },
        nombre: dto.nombre.trim(),
        sector: dto.sector.trim(),
        // Se guarda null y no cadena vacia cuando no viene: la columna es
        // nullable, y "sin cliente" y "cliente en blanco" son lo mismo. Con dos
        // representaciones para el mismo hecho, cualquier filtro futuro tendria
        // que preguntar por las dos.
        cliente: dto.cliente?.trim() || null,
        problema: dto.problema ?? '',
        dolores: dto.dolores ?? '',
        solucion: dto.solucion ?? '',
        plusIA: dto.plusIA ?? '',
        estado: dto.estado ?? 'idea',
        autorId: user.id,
        // Si no se indica grupo, hereda el de quien lo registra.
        groupId: dto.groupId ?? user.groupId,
        similares: dto.similares?.length
          ? { create: dto.similares.map((s, orden) => ({ name: s.name, url: s.url, orden })) }
          : undefined,
      },
      include: PROJECT_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateProjectDto, user: RequestUser) {
    const antes = await this.soloAutorOAdmin(id, user);

    return this.prisma.$transaction(async tx => {
      // El cambio de etapa se registra en la misma transaccion que el update:
      // si una de las dos falla, no queda un estado sin su fecha de entrada.
      if (dto.estado !== undefined && dto.estado !== antes.estado) {
        await tx.projectStatusChange.create({
          data: { projectId: id, estado: dto.estado, anterior: antes.estado, porId: user.id },
        });
      }

      if (dto.similares) {
        await tx.projectSimilar.deleteMany({ where: { projectId: id } });
        if (dto.similares.length) {
          await tx.projectSimilar.createMany({
            data: dto.similares.map((s, orden) => ({ projectId: id, name: s.name, url: s.url, orden })),
          });
        }
      }

      return tx.project.update({
        where: { id },
        include: PROJECT_INCLUDE_DETALLE,
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
          ...(dto.sector !== undefined ? { sector: dto.sector.trim() } : {}),
          ...(dto.cliente !== undefined ? { cliente: dto.cliente.trim() || null } : {}),
          ...(dto.problema !== undefined ? { problema: dto.problema } : {}),
          ...(dto.dolores !== undefined ? { dolores: dto.dolores } : {}),
          ...(dto.solucion !== undefined ? { solucion: dto.solucion } : {}),
          ...(dto.plusIA !== undefined ? { plusIA: dto.plusIA } : {}),
          ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
          ...(dto.groupId !== undefined ? { groupId: dto.groupId } : {}),
        },
      });
    });
  }

  /**
   * Mueve la etapa, y nada más. Es la operación del tablero.
   *
   * El permiso es más amplio que el de editar: quien tiene el trabajo a cargo
   * puede avanzar su etapa aunque no sea el autor del proyecto. Sin esto el
   * tablero sería de solo lectura para justamente quien lo usa.
   */
  async cambiarEstado(id: string, estado: ProjectStatus, user: RequestUser) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: {
        autorId: true,
        estado: true,
        assignments: { where: { asignadoAId: user.id }, select: { id: true }, take: 1 },
      },
    });
    if (!project) throw new NotFoundException('El proyecto no existe.');

    const puede =
      project.autorId === user.id || user.rol === 'admin' || project.assignments.length > 0;
    if (!puede) {
      throw new ForbiddenException('Solo quien lo tiene a cargo, su autor o un administrador puede moverlo.');
    }

    if (estado === project.estado) {
      // Nada que hacer: no se registra una entrada de etapa falsa.
      return this.prisma.project.findUniqueOrThrow({ where: { id }, include: PROJECT_INCLUDE_DETALLE });
    }

    return this.prisma.$transaction(async tx => {
      await tx.projectStatusChange.create({
        data: { projectId: id, estado, anterior: project.estado, porId: user.id },
      });
      return tx.project.update({
        where: { id },
        data: { estado },
        include: PROJECT_INCLUDE_DETALLE,
      });
    });
  }

  /** Guarda lo que produce el motor de IA. En la fase 2 lo llenará el backend. */
  async saveAiResult(id: string, dto: SaveAiResultDto, user: RequestUser) {
    await this.findOne(id, user);
    return this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.enriquecido !== undefined ? { enriquecido: dto.enriquecido } : {}),
        ...(dto.score !== undefined ? { score: dto.score } : {}),
        ...(dto.enrichment !== undefined ? { enrichment: dto.enrichment as Prisma.InputJsonValue } : {}),
      },
      include: PROJECT_INCLUDE,
    });
  }

  /** Archivar en lugar de borrar: el proyecto sale de las listas pero no se pierde. */
  async setArchivado(id: string, archivado: boolean, user: RequestUser) {
    await this.soloAutorOAdmin(id, user);
    return this.prisma.project.update({
      where: { id },
      data: { archivado, archivadoAt: archivado ? new Date() : null },
      include: PROJECT_INCLUDE,
    });
  }

  /** Devuelve el estado previo: quien registra el cambio necesita saber de donde venia. */
  private async soloAutorOAdmin(id: string, user: RequestUser) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { autorId: true, estado: true },
    });
    if (!project) throw new NotFoundException('El proyecto no existe.');

    const puede = project.autorId === user.id || user.rol === 'admin';
    if (!puede) throw new ForbiddenException('Solo el autor o un administrador puede modificarlo.');

    return project;
  }
}
