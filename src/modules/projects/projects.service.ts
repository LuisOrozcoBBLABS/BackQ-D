import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { CreateProjectDto, SaveAiResultDto, UpdateProjectDto } from './dto/project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';

const PROJECT_INCLUDE = {
  similares: { orderBy: { orden: 'asc' } },
  autor: { select: { id: true, nombre: true, email: true, avatarUrl: true } },
  group: { select: { id: true, nombre: true } },
  _count: { select: { assignments: true } },
} satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Visibilidad: con projects.viewAll se ve todo. Sin ese permiso, cada persona ve
   * los propios y los de su grupo. Se decide en el servidor, no en el front.
   */
  private alcance(user: RequestUser): Prisma.ProjectWhereInput {
    if (user.permisos.includes('projects.viewAll')) return {};
    return {
      OR: [{ autorId: user.id }, ...(user.groupId ? [{ groupId: user.groupId }] : [])],
    };
  }

  findAll(q: QueryProjectsDto, user: RequestUser) {
    const where: Prisma.ProjectWhereInput = {
      AND: [
        this.alcance(user),
        q.archivados ? {} : { archivado: false },
        q.sector ? { sector: q.sector } : {},
        q.estado ? { estado: q.estado } : {},
        q.groupId ? { groupId: q.groupId } : {},
        q.q
          ? {
              OR: [
                { nombre: { contains: q.q, mode: 'insensitive' } },
                { problema: { contains: q.q, mode: 'insensitive' } },
                { solucion: { contains: q.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    return this.prisma.project.findMany({
      where,
      include: PROJECT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: q.skip ?? 0,
      take: Math.min(q.take ?? 50, 200),
    });
  }

  async findOne(id: string, user: RequestUser) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: PROJECT_INCLUDE });
    if (!project) throw new NotFoundException('El proyecto no existe.');

    const puedeVer =
      user.permisos.includes('projects.viewAll') ||
      project.autorId === user.id ||
      (project.groupId !== null && project.groupId === user.groupId);
    if (!puedeVer) throw new ForbiddenException('Este proyecto es de otro grupo.');

    return project;
  }

  create(dto: CreateProjectDto, user: RequestUser) {
    return this.prisma.project.create({
      data: {
        nombre: dto.nombre.trim(),
        sector: dto.sector.trim(),
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
    await this.soloAutorOAdmin(id, user);

    return this.prisma.$transaction(async tx => {
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
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
          ...(dto.sector !== undefined ? { sector: dto.sector.trim() } : {}),
          ...(dto.problema !== undefined ? { problema: dto.problema } : {}),
          ...(dto.dolores !== undefined ? { dolores: dto.dolores } : {}),
          ...(dto.solucion !== undefined ? { solucion: dto.solucion } : {}),
          ...(dto.plusIA !== undefined ? { plusIA: dto.plusIA } : {}),
          ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
          ...(dto.groupId !== undefined ? { groupId: dto.groupId } : {}),
        },
        include: PROJECT_INCLUDE,
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

  private async soloAutorOAdmin(id: string, user: RequestUser): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id }, select: { autorId: true } });
    if (!project) throw new NotFoundException('El proyecto no existe.');

    const puede = project.autorId === user.id || user.rol === 'admin';
    if (!puede) throw new ForbiddenException('Solo el autor o un administrador puede modificarlo.');
  }
}
