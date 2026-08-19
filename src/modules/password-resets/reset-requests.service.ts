import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EstadoSolicitud, RoleId } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Restablecimiento de contraseña mediado por un administrador.
 *
 * No se emiten tokens por correo: la persona pide el restablecimiento, los
 * administradores lo ven en el módulo de usuarios y asignan una clave temporal
 * que la persona está obligada a cambiar al entrar. Así el flujo funciona
 * aunque el correo corporativo todavía no esté configurado, y nunca hay un
 * enlace de reseteo viajando por ahí.
 */
@Injectable()
export class ResetRequestsService {
  private readonly logger = new Logger(ResetRequestsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra el pedido. Devuelve siempre lo mismo exista o no la cuenta: si
   * respondiera distinto, cualquiera podría averiguar qué correos existen.
   */
  async solicitar(email: string, nota?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, nombre: true, email: true, activo: true },
    });

    if (!user) {
      this.logger.log(`Pedido de restablecimiento para un correo inexistente (${email}).`);
      return;
    }

    // Si ya hay una pendiente, se actualiza la nota en lugar de acumular pedidos.
    const pendiente = await this.prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, estado: EstadoSolicitud.pendiente },
      select: { id: true },
    });

    if (pendiente) {
      if (nota) {
        await this.prisma.passwordResetRequest.update({
          where: { id: pendiente.id },
          data: { nota },
        });
      }
      return;
    }

    const solicitud = await this.prisma.passwordResetRequest.create({
      data: { userId: user.id, nota: nota ?? null },
      select: { id: true },
    });

    // Aviso en la campana de cada administrador activo.
    const admins = await this.prisma.user.findMany({
      where: { rolId: RoleId.admin, activo: true },
      select: { id: true },
    });

    if (admins.length) {
      await this.prisma.notification.createMany({
        data: admins.map(a => ({
          userId: a.id,
          titulo: 'Piden restablecer una contraseña',
          detalle: `${user.nombre} (${user.email}) no puede entrar y pidió una clave nueva.`,
        })),
      });
    }

    this.logger.log(`Solicitud ${solicitud.id} registrada para ${user.email}.`);
  }

  /** Pedidos pendientes, para el módulo de usuarios. */
  pendientes() {
    return this.prisma.passwordResetRequest.findMany({
      where: { estado: EstadoSolicitud.pendiente },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, nombre: true, email: true, activo: true, avatarUrl: true } },
      },
    });
  }

  /** Cierra las pendientes de una persona: la clave ya se restableció. */
  async cerrarDe(userId: string, atendidaPorId: string): Promise<number> {
    const r = await this.prisma.passwordResetRequest.updateMany({
      where: { userId, estado: EstadoSolicitud.pendiente },
      data: { estado: EstadoSolicitud.atendida, atendidaPorId, atendidaAt: new Date() },
    });
    return r.count;
  }

  /** Descarta un pedido sin tocar la contraseña (por ejemplo, si fue un error). */
  async descartar(id: string, atendidaPorId: string) {
    const existe = await this.prisma.passwordResetRequest.count({ where: { id } });
    if (!existe) throw new NotFoundException('La solicitud no existe.');

    return this.prisma.passwordResetRequest.update({
      where: { id },
      data: { estado: EstadoSolicitud.descartada, atendidaPorId, atendidaAt: new Date() },
      include: { user: { select: { id: true, nombre: true, email: true } } },
    });
  }
}
