import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../types/request-user';

/** Lo único que se puede hacer con una clave temporal: verse y cambiarla. */
const PERMITIDAS = ['/auth/me', '/auth/change-password', '/auth/logout'];

/**
 * Con una contraseña temporal, la cuenta no puede operar. Antes el servidor solo
 * lo informaba (`debeCambiarPassword`) y confiaba en que el front obedeciera:
 * cualquiera con el token podía seguir usando la API con la clave que le dio
 * un administrador.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = req.user;

    // Rutas públicas: el JwtAuthGuard no dejó usuario y no hay nada que exigir.
    if (!user?.debeCambiarPassword) return true;

    const ruta = req.path;
    if (PERMITIDAS.some(p => ruta.endsWith(p))) return true;

    throw new ForbiddenException(
      'Tenés que cambiar la contraseña temporal antes de usar la plataforma.',
    );
  }
}
