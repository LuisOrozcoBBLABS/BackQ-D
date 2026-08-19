import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UsersService } from '../users/users.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  /** Hash de contraseña con argon2id. */
  static hashPassword(plano: string): Promise<string> {
    return hash(plano);
  }

  async login(email: string, password: string): Promise<TokenPair & { debeCambiarPassword: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

    // Mismo mensaje para correo inexistente y clave incorrecta: no revelamos qué correos existen.
    const generico = 'Correo o contraseña incorrectos.';
    if (!user) throw new UnauthorizedException(generico);
    if (!user.activo) throw new ForbiddenException('La cuenta está desactivada. Contacta a un administrador.');

    const ok = await verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw new UnauthorizedException(generico);

    const tokens = await this.emitirTokens(user.id, user.email);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: await hash(tokens.refreshToken),
        ultimoLoginAt: new Date(),
      },
    });

    return { ...tokens, debeCambiarPassword: user.debeCambiarPassword };
  }

  /** Rotación de refresh: el token usado se invalida y se emite uno nuevo. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('Sesión expirada. Ingresa de nuevo.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user?.refreshTokenHash || !user.activo) throw new UnauthorizedException('Sesión inválida.');

    const coincide = await verify(user.refreshTokenHash, refreshToken).catch(() => false);
    if (!coincide) {
      // Token viejo o robado: cerramos todas las sesiones por seguridad.
      await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: null } });
      throw new UnauthorizedException('Sesión inválida. Ingresa de nuevo.');
    }

    const tokens = await this.emitirTokens(user.id, user.email);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await hash(tokens.refreshToken) },
    });
    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
  }

  async changePassword(userId: string, actual: string, nueva: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await verify(user.passwordHash, actual).catch(() => false);
    if (!ok) throw new UnauthorizedException('La contraseña actual no coincide.');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hash(nueva),
        debeCambiarPassword: false,
        refreshTokenHash: null, // cerrar sesiones abiertas tras cambiar la clave
      },
    });
  }

  /** Perfil del usuario autenticado, con permisos efectivos. */
  me(userId: string) {
    return this.users.findOne(userId);
  }

  private async emitirTokens(sub: string, email: string): Promise<TokenPair> {
    // Los TTL vienen del .env como texto; jsonwebtoken espera su propio tipo de duración.
    const ttl = (valor: string | undefined, porDefecto: string): JwtSignOptions['expiresIn'] =>
      (valor ?? porDefecto) as JwtSignOptions['expiresIn'];

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub, email },
        {
          secret: process.env.JWT_ACCESS_SECRET,
          expiresIn: ttl(process.env.JWT_ACCESS_TTL, '15m'),
        },
      ),
      this.jwt.signAsync(
        { sub },
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: ttl(process.env.JWT_REFRESH_TTL, '7d'),
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }
}
