import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cada persona ve solo sus notificaciones. */
  findMine(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      include: { envios: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async unreadCount(userId: string): Promise<{ noLeidas: number }> {
    const noLeidas = await this.prisma.notification.count({ where: { userId, leida: false } });
    return { noLeidas };
  }

  async markRead(id: string, userId: string) {
    const n = await this.prisma.notification.findUnique({ where: { id }, select: { userId: true } });
    if (!n) throw new NotFoundException('La notificación no existe.');
    if (n.userId !== userId) throw new ForbiddenException('Esa notificación no es tuya.');

    return this.prisma.notification.update({
      where: { id },
      data: { leida: true },
      include: { envios: true },
    });
  }

  async markAllRead(userId: string): Promise<{ actualizadas: number }> {
    const r = await this.prisma.notification.updateMany({
      where: { userId, leida: false },
      data: { leida: true },
    });
    return { actualizadas: r.count };
  }
}
