import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  CreateGroupDto,
  QueryGroupsDto,
  SetMembersDto,
  UpdateGroupDto,
} from './dto/group.dto';

const GROUP_INCLUDE = {
  miembros: {
    where: { activo: true },
    select: { id: true, nombre: true, email: true, cargo: true, avatarUrl: true },
    orderBy: { nombre: 'asc' },
  },
  _count: { select: { proyectos: true } },
} satisfies Prisma.GroupInclude;

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(q: QueryGroupsDto) {
    const estado = q.estado ?? 'activos';
    return this.prisma.group.findMany({
      where: estado === 'todos' ? {} : { activo: estado === 'activos' },
      include: GROUP_INCLUDE,
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const group = await this.prisma.group.findUnique({ where: { id }, include: GROUP_INCLUDE });
    if (!group) throw new NotFoundException('El grupo no existe.');
    return group;
  }

  create(dto: CreateGroupDto) {
    return this.prisma.group.create({
      data: { nombre: dto.nombre.trim(), lema: dto.lema?.trim() ?? '' },
      include: GROUP_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateGroupDto) {
    await this.existe(id);
    return this.prisma.group.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.lema !== undefined ? { lema: dto.lema.trim() } : {}),
      },
      include: GROUP_INCLUDE,
    });
  }

  /**
   * Archivar en lugar de borrar: los integrantes quedan sin grupo y los proyectos
   * conservan su historia (groupId pasa a null por la FK con SetNull).
   */
  async setActivo(id: string, activo: boolean) {
    await this.existe(id);
    if (!activo) {
      await this.prisma.user.updateMany({ where: { groupId: id }, data: { groupId: null } });
    }
    return this.prisma.group.update({ where: { id }, data: { activo }, include: GROUP_INCLUDE });
  }

  /** Reemplaza la lista de integrantes. Cada persona pertenece a un solo grupo. */
  async setMembers(id: string, dto: SetMembersDto) {
    await this.existe(id);

    const existentes = await this.prisma.user.count({ where: { id: { in: dto.userIds } } });
    if (existentes !== dto.userIds.length) {
      throw new BadRequestException('Alguno de los usuarios no existe.');
    }

    await this.prisma.$transaction([
      this.prisma.user.updateMany({ where: { groupId: id }, data: { groupId: null } }),
      this.prisma.user.updateMany({ where: { id: { in: dto.userIds } }, data: { groupId: id } }),
    ]);
    return this.findOne(id);
  }

  private async existe(id: string): Promise<void> {
    const n = await this.prisma.group.count({ where: { id } });
    if (!n) throw new NotFoundException('El grupo no existe.');
  }
}
