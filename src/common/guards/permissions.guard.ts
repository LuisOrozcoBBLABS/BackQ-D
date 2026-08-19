import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { RequestUser } from '../types/request-user';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!requeridos?.length) return true;

    const user = ctx.switchToHttp().getRequest<{ user?: RequestUser }>().user;
    if (!user) throw new ForbiddenException('Sin permisos.');

    const falta = requeridos.find(p => !user.permisos.includes(p));
    if (falta) throw new ForbiddenException(`Te falta el permiso "${falta}".`);
    return true;
  }
}
