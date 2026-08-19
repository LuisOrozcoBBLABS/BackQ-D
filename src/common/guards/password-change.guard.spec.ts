import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RoleId } from '@prisma/client';
import { RequestUser } from '../types/request-user';
import { PasswordChangeGuard } from './password-change.guard';

function contexto(path: string, user?: Partial<RequestUser>): ExecutionContext {
  const completo = user
    ? ({
        id: 'u-1',
        email: 'ana@bblabs.io',
        rol: RoleId.colaborador,
        groupId: null,
        permisos: [],
        debeCambiarPassword: false,
        ...user,
      } as RequestUser)
    : undefined;

  return {
    switchToHttp: () => ({ getRequest: () => ({ path, user: completo }) }),
  } as unknown as ExecutionContext;
}

describe('PasswordChangeGuard', () => {
  const guard = new PasswordChangeGuard();

  it('no molesta a quien ya cambió su contraseña', () => {
    expect(guard.canActivate(contexto('/api/projects', { debeCambiarPassword: false }))).toBe(true);
  });

  it('no molesta en rutas públicas, donde no hay usuario', () => {
    expect(guard.canActivate(contexto('/api/auth/login'))).toBe(true);
  });

  it('bloquea la plataforma mientras la contraseña sea temporal', () => {
    const ctx = contexto('/api/projects', { debeCambiarPassword: true });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow(/cambiar la contraseña temporal/);
  });

  it('deja ver el perfil y cambiar la clave, que es lo único necesario', () => {
    for (const ruta of ['/api/auth/me', '/api/auth/change-password', '/api/auth/logout']) {
      expect(guard.canActivate(contexto(ruta, { debeCambiarPassword: true }))).toBe(true);
    }
  });

  it('no se deja engañar por una ruta que contenga el texto permitido', () => {
    const ctx = contexto('/api/projects/auth/me-falso', { debeCambiarPassword: true });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
