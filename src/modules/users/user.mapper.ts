import { Genero, Group, Prisma } from '@prisma/client';

/** Usuario tal como lo consume el front. Nunca incluye hashes ni tokens. */
export interface UserDto {
  id: string;
  nombre: string;
  email: string;
  cargo: string;
  rol: string;
  groupId: string | null;
  grupo: string | null;
  activo: boolean;
  permisosExtra: string[];
  permisosEfectivos: string[];
  avatarUrl: string | null;
  linkedin: string | null;
  telefono: string | null;
  genero: string | null;
  fechaNacimiento: string | null;
  onboardingCompleto: boolean;
  debeCambiarPassword: boolean;
  ultimoLoginAt: string | null;
  createdAt: string;
}

export const USER_INCLUDE = {
  rol: { include: { permissions: true } },
  permisosExtra: true,
  group: true,
} satisfies Prisma.UserInclude;

type UserConRelaciones = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

/** El enum de Prisma no admite guiones; el contrato del front sí los usa. */
function generoToApi(g: Genero | null): string | null {
  return g === null ? null : g.replace(/_/g, '-');
}

function fechaSolo(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function toUserDto(u: UserConRelaciones): UserDto {
  const delRol = u.rol.permissions.map(p => p.permissionId);
  const extras = u.permisosExtra.map(p => p.permissionId);

  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    cargo: u.cargo,
    rol: u.rolId,
    groupId: u.groupId,
    grupo: (u.group as Group | null)?.nombre ?? null,
    activo: u.activo,
    permisosExtra: extras,
    permisosEfectivos: [...new Set([...delRol, ...extras])],
    avatarUrl: u.avatarUrl,
    linkedin: u.linkedin,
    telefono: u.telefono,
    genero: generoToApi(u.genero),
    fechaNacimiento: fechaSolo(u.fechaNacimiento),
    onboardingCompleto: u.onboardingCompleto,
    debeCambiarPassword: u.debeCambiarPassword,
    ultimoLoginAt: u.ultimoLoginAt ? u.ultimoLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}
