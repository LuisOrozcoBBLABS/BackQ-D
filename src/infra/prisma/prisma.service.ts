import { INestApplication, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Vacía las tablas en orden seguro. Solo para tests. */
  async limpiarParaTests(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') return;
    await this.notificationEnvio.deleteMany();
    await this.notification.deleteMany();
    await this.assignment.deleteMany();
    await this.projectSimilar.deleteMany();
    await this.project.deleteMany();
    await this.userPermission.deleteMany();
    await this.user.deleteMany();
    await this.group.deleteMany();
  }
}
