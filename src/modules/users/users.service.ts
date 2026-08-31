import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Genero, Prisma, RoleId } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ORDEN_USUARIOS, OrdenUsuarios, QueryUsersDto } from './dto/query-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { USER_INCLUDE, UserDto, toUserDto } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filtros compartidos por la lista y el conteo. */
  private filtros(q: QueryUsersDto): Prisma.UserWhereInput {
    const estado = q.estado ?? 'todos';
    return {
      ...(estado === 'todos' ? {} : { activo: estado === 'activos' }),
      ...(q.rol ? { rolId: q.rol } : {}),
      ...(q.q
        ? {
            OR: [
              { nombre: { contains: q.q, mode: 'insensitive' } },
              { email: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  /** Total que cumple los filtros, para paginar. */
  contar(q: QueryUsersDto): Promise<number> {
    return this.prisma.user.count({ where: this.filtros(q) });
  }

  /**
   * Orden de la lista. Ver el comentario extenso en projects.service.ts: la
   * lista blanca se revalida en runtime porque el tipo no existe ahi, y el
   * desempate por id hace determinista la paginacion.
   *
   * El caso de `ultimoLoginAt` es propio de este modulo: es nullable, y en
   * PostgreSQL `ORDER BY col DESC` pone los NULL PRIMERO. Sin `nulls: 'last'`,
   * un admin que ordena por "ultimo ingreso, mas reciente arriba" recibe arriba
   * de todo a la gente que nunca se logueo — exactamente lo contrario de lo que
   * pidio.
   */
  private orden(q: QueryUsersDto): Prisma.UserOrderByWithRelationInput[] {
    const campo: OrdenUsuarios = ORDEN_USUARIOS.includes(q.sort as OrdenUsuarios)
      ? (q.sort as OrdenUsuarios)
      : 'nombre';
    const sentido: Prisma.SortOrder = q.dir === 'desc' ? 'desc' : 'asc';
    const primero: Prisma.UserOrderByWithRelationInput =
      campo === 'ultimoLoginAt' || campo === 'cargo'
        ? { [campo]: { sort: sentido, nulls: 'last' } }
        : { [campo]: sentido };
    return [primero, { id: 'asc' }];
  }

  async findAll(q: QueryUsersDto): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({
      where: this.filtros(q),
      include: USER_INCLUDE,
      // Alfabetico por defecto: en una lista de personas es como se busca.
      orderBy: this.orden(q),
      skip: q.skip ?? 0,
      take: Math.min(q.take ?? 50, 200),
    });
    return users.map(toUserDto);
  }

  async findOne(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: USER_INCLUDE });
    if (!user) throw new NotFoundException('El usuario no existe.');
    return toUserDto(user);
  }

  async create(dto: CreateUserDto): Promise<UserDto> {
    await this.validarPermisos(dto.permisosExtra);
    await this.validarGrupo(dto.groupId);

    const user = await this.prisma.user.create({
      data: {
        nombre: dto.nombre.trim(),
        email: dto.email.trim().toLowerCase(),
        cargo: dto.cargo?.trim() ?? '',
        passwordHash: await hash(dto.password),
        rolId: dto.rol,
        groupId: dto.groupId ?? null,
        activo: dto.activo ?? true,
        // Quien crea la cuenta conoce la clave inicial: hay que cambiarla al entrar.
        debeCambiarPassword: true,
        permisosExtra: dto.permisosExtra?.length
          ? { create: dto.permisosExtra.map(permissionId => ({ permissionId })) }
          : undefined,
      },
      include: USER_INCLUDE,
    });
    return toUserDto(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDto> {
    await this.existe(id);
    await this.validarPermisos(dto.permisosExtra);
    await this.validarGrupo(dto.groupId);

    const user = await this.prisma.$transaction(async tx => {
      if (dto.permisosExtra) {
        // Reemplazo completo del conjunto de permisos extra.
        await tx.userPermission.deleteMany({ where: { userId: id } });
        if (dto.permisosExtra.length) {
          await tx.userPermission.createMany({
            data: dto.permisosExtra.map(permissionId => ({ userId: id, permissionId })),
          });
        }
      }

      return tx.user.update({
        where: { id },
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
          ...(dto.cargo !== undefined ? { cargo: dto.cargo.trim() } : {}),
          ...(dto.rol !== undefined ? { rolId: dto.rol } : {}),
          ...(dto.groupId !== undefined ? { groupId: dto.groupId } : {}),
          ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
        },
        include: USER_INCLUDE,
      });
    });
    return toUserDto(user);
  }

  /** Lo que cada persona edita de su propio perfil. */
  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserDto> {
    await this.existe(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.linkedin !== undefined ? { linkedin: dto.linkedin } : {}),
        ...(dto.telefono !== undefined ? { telefono: dto.telefono } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.onboardingCompleto !== undefined ? { onboardingCompleto: dto.onboardingCompleto } : {}),
        ...(dto.genero !== undefined
          ? { genero: dto.genero === null ? null : (dto.genero.replace(/-/g, '_') as Genero) }
          : {}),
        ...(dto.fechaNacimiento !== undefined
          ? { fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : null }
          : {}),
      },
      include: USER_INCLUDE,
    });
    return toUserDto(user);
  }

  /** Activar / desactivar. No borramos personas: se archivan. */
  async setActivo(id: string, activo: boolean, solicitanteId: string): Promise<UserDto> {
    if (id === solicitanteId && !activo) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta.');
    }
    await this.existe(id);

    if (!activo) await this.garantizarOtroAdmin(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { activo, refreshTokenHash: activo ? undefined : null },
      include: USER_INCLUDE,
    });
    return toUserDto(user);
  }

  /** Reset de contraseña por un admin: la persona debe cambiarla al entrar. */
  async resetPassword(id: string, nueva: string): Promise<void> {
    await this.existe(id);
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hash(nueva),
        debeCambiarPassword: true,
        refreshTokenHash: null,
      },
    });
  }

  async permissionsCatalog() {
    return this.prisma.permission.findMany({ orderBy: [{ grupo: 'asc' }, { id: 'asc' }] });
  }

  async rolesCatalog() {
    return this.prisma.role.findMany({ include: { permissions: true }, orderBy: { id: 'asc' } });
  }

  private async existe(id: string): Promise<void> {
    const n = await this.prisma.user.count({ where: { id } });
    if (!n) throw new NotFoundException('El usuario no existe.');
  }

  private async validarPermisos(permisos?: string[]): Promise<void> {
    if (!permisos?.length) return;
    const validos = await this.prisma.permission.findMany({
      where: { id: { in: permisos } },
      select: { id: true },
    });
    const faltan = permisos.filter(p => !validos.some(v => v.id === p));
    if (faltan.length) throw new BadRequestException(`Permisos inexistentes: ${faltan.join(', ')}.`);
  }

  private async validarGrupo(groupId?: string | null): Promise<void> {
    if (!groupId) return;
    const n = await this.prisma.group.count({ where: { id: groupId } });
    if (!n) throw new BadRequestException('El grupo no existe.');
  }

  /** Evita quedarse sin ningún administrador activo. */
  private async garantizarOtroAdmin(idQueSale: string): Promise<void> {
    const otros = await this.prisma.user.count({
      where: { rolId: RoleId.admin, activo: true, id: { not: idQueSale } },
    });
    if (!otros) throw new BadRequestException('Debe quedar al menos un administrador activo.');
  }
}
