import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Canal, EnvioEstado } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { asuntoAsignacion, htmlAsignacion } from '../mail/plantillas/asignacion';

const MAX_INTENTOS = 5;
const LOTE = 20;

/** Espera creciente entre intentos: 1, 5, 15, 60 minutos. */
const ESPERA_MINUTOS = [1, 5, 15, 60];

/**
 * Despachador de avisos. Cada 30 segundos toma los envíos pendientes y los manda
 * por correo, dejando registrado el estado real. Es lo que reemplaza al
 * "Enviado (simulado)" de la versión anterior.
 *
 * Para el volumen interno del área, un cron sobre la tabla alcanza: no hace
 * falta Redis ni BullMQ todavía.
 */
@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);
  private corriendo = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async despachar(): Promise<void> {
    // Evita solapamiento si un lote tarda más que el intervalo del cron.
    if (this.corriendo) return;
    this.corriendo = true;
    try {
      await this.marcarCanalesNoHabilitados();

      if (!this.mail.configurado) {
        const pendientes = await this.prisma.notificationEnvio.count({
          where: { canal: Canal.correo, estado: EnvioEstado.pendiente },
        });
        if (pendientes > 0) this.mail.avisarFaltaConfiguracion();
        return;
      }

      await this.procesarCorreos();
    } catch (e) {
      this.logger.error(`Fallo el ciclo de despacho: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.corriendo = false;
    }
  }

  /**
   * WhatsApp y Teams no están habilitados en el MVP. En lugar de dejarlos
   * pendientes para siempre, se marcan con el motivo, para que la interfaz diga
   * la verdad.
   */
  private async marcarCanalesNoHabilitados(): Promise<void> {
    await this.prisma.notificationEnvio.updateMany({
      where: { canal: { in: [Canal.whatsapp, Canal.teams] }, estado: EnvioEstado.pendiente },
      data: {
        estado: EnvioEstado.no_configurado,
        detalle: 'Canal todavía no habilitado. El aviso por correo sí se envió.',
      },
    });
  }

  private async procesarCorreos(): Promise<void> {
    const ahora = new Date();

    const pendientes = await this.prisma.notificationEnvio.findMany({
      where: {
        canal: Canal.correo,
        estado: EnvioEstado.pendiente,
        intento: { lt: MAX_INTENTOS },
        OR: [{ proximoIntentoAt: null }, { proximoIntentoAt: { lte: ahora } }],
      },
      orderBy: { createdAt: 'asc' },
      take: LOTE,
      include: {
        notification: {
          include: {
            user: { select: { nombre: true, email: true } },
            assignment: {
              include: {
                project: { select: { nombre: true, sector: true } },
                asignadoPor: { select: { nombre: true } },
              },
            },
          },
        },
      },
    });

    for (const envio of pendientes) {
      const asignacion = envio.notification.assignment;
      const destinatario = envio.destino || envio.notification.user.email;

      if (!asignacion || !destinatario) {
        await this.prisma.notificationEnvio.update({
          where: { id: envio.id },
          data: {
            estado: EnvioEstado.no_configurado,
            detalle: !destinatario
              ? 'La persona no tiene correo registrado.'
              : 'El aviso no está ligado a una asignación.',
          },
        });
        continue;
      }

      const base = (process.env.APP_URL ?? 'http://localhost:4300').replace(/\/$/, '');
      const datos = {
        nombrePersona: envio.notification.user.nombre,
        nombreProyecto: asignacion.project.nombre,
        sector: asignacion.project.sector,
        prioridad: asignacion.prioridad,
        nota: asignacion.nota,
        fechaLimite: asignacion.fechaLimite,
        asignadoPor: asignacion.asignadoPor.nombre,
        urlAsignacion: `${base}/proyectos/${asignacion.projectId}`,
      };

      const resultado = await this.mail.enviar({
        para: destinatario,
        asunto: asuntoAsignacion(datos),
        html: htmlAsignacion(datos),
      });

      const intento = envio.intento + 1;

      if (resultado.ok) {
        await this.prisma.notificationEnvio.update({
          where: { id: envio.id },
          data: { estado: EnvioEstado.enviado, enviadoAt: new Date(), intento, detalle: null },
        });
        this.logger.log(`Aviso enviado a ${destinatario} (${asignacion.project.nombre})`);
        continue;
      }

      const agotado = !resultado.reintentable || intento >= MAX_INTENTOS;
      const espera = ESPERA_MINUTOS[Math.min(intento - 1, ESPERA_MINUTOS.length - 1)];

      await this.prisma.notificationEnvio.update({
        where: { id: envio.id },
        data: {
          estado: agotado ? EnvioEstado.fallido : EnvioEstado.pendiente,
          intento,
          detalle: resultado.motivo,
          proximoIntentoAt: agotado ? null : new Date(Date.now() + espera * 60_000),
        },
      });

      this.logger.warn(
        `Envío a ${destinatario} ${agotado ? 'fallido definitivo' : `reintenta en ${espera} min`}: ${resultado.motivo}`,
      );
    }
  }
}
