import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleId } from '@prisma/client';
import { RequestUser } from '../types/request-user';
import { PermissionsGuard } from './permissions.guard';

function contexto(user?: RequestUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function usuario(permisos: string[]): RequestUser {
  return {
    id: 'u-1',
    email: 'ana@bblabs.io',
    rol: RoleId.colaborador,
    groupId: null,
    permisos,
    debeCambiarPassword: false,
  };
}

describe('PermissionsGuard', () => {
  function guardConRequeridos(requeridos: string[] | undefined): PermissionsGuard {
    const reflector = { getAllAndOverride: () => requeridos } as unknown as Reflector;
    return new PermissionsGuard(reflector);
  }

  it('deja pasar cuando la ruta no exige permisos', () => {
    expect(guardConRequeridos(undefined).canActivate(contexto(usuario([])))).toBe(true);
    expect(guardConRequeridos([]).canActivate(contexto(usuario([])))).toBe(true);
  });

  it('deja pasar con el permiso exacto', () => {
    const guard = guardConRequeridos(['users.manage']);
    expect(guard.canActivate(contexto(usuario(['users.manage', 'ai.use'])))).toBe(true);
  });

  it('bloquea sin el permiso y dice cuál falta', () => {
    const guard = guardConRequeridos(['users.manage']);
    expect(() => guard.canActivate(contexto(usuario(['projects.create'])))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contexto(usuario(['projects.create'])))).toThrow(/users\.manage/);
  });

  it('exige TODOS los permisos cuando la ruta pide varios', () => {
    const guard = guardConRequeridos(['users.manage', 'roles.manage']);
    expect(() => guard.canActivate(contexto(usuario(['users.manage'])))).toThrow(ForbiddenException);
  });

  it('bloquea si no hay usuario en la petición', () => {
    const guard = guardConRequeridos(['users.manage']);
    expect(() => guard.canActivate(contexto(undefined))).toThrow(ForbiddenException);
  });
});
