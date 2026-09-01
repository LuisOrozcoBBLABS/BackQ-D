import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LIMITES } from './common/throttling';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PasswordChangeGuard } from './common/guards/password-change.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PrismaModule } from './infra/prisma/prisma.module';
import { AiModule } from './modules/ai/ai.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { AuthModule } from './modules/auth/auth.module';
import { GroupsModule } from './modules/groups/groups.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot(LIMITES),
    ScheduleModule.forRoot(), // despachador de avisos por correo
    JwtModule.register({}),
    PrismaModule,
    AuthModule,
    UsersModule,
    GroupsModule,
    ProjectsModule,
    AssignmentsModule,
    NotificationsModule,
    AiModule,
    HealthModule,
  ],
  providers: [
    // El orden importa, y el del throttler cambió a propósito.
    //
    // Estaba PRIMERO, antes de autenticar. En ese punto `request.user` todavía
    // no existe, así que lo único por lo que se podía contar era la IP — y de
    // ahí salía que una oficina entera compartiera un solo presupuesto. Contar
    // por persona exige que la autenticación ya haya corrido.
    //
    // Moverlo detrás NO deja la base expuesta a una avalancha sin sesión, y vale
    // la pena decir por qué: JwtAuthGuard verifica la FIRMA del token
    // (jwt-auth.guard.ts:40) antes de consultar la base (:47). Un token forjado
    // muere en la verificación sin costar una sola consulta, y firmar uno válido
    // requiere el secreto. Lo que sí llega a la base es tráfico con token
    // legítimo, que es justamente lo que el límite por persona acota.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: PasswordChangeGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
