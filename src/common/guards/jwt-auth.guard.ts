import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestUser } from '../types/request-user';
import { PrismaService } from '../../infra/prisma/prisma.service';

interface AccessPayload {
  sub: string;
  email: string;
}

/**
 * Valida el access token y arma request.user con los permisos EFECTIVOS
 * (rol + extras) leídos de la base, no de lo que diga el cliente.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (esPublica) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const header = req.headers.authorization ?? '';
    const [tipo, token] = header.split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Falta el token de acceso.');

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        rol: { include: { permissions: true } },
        permisosExtra: true,
      },
    });
    if (!user) throw new UnauthorizedException('La cuenta ya no existe.');
    if (!user.activo) throw new UnauthorizedException('La cuenta está desactivada.');

    const permisos = new Set<string>([
      ...user.rol.permissions.map(p => p.permissionId),
      ...user.permisosExtra.map(p => p.permissionId),
    ]);

    req.user = {
      id: user.id,
      email: user.email,
      rol: user.rolId,
      groupId: user.groupId,
      permisos: [...permisos],
      debeCambiarPassword: user.debeCambiarPassword,
    };
    return true;
  }
}
