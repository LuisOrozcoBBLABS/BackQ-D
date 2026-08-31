import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Canal, EnvioEstado, Prisma, TipoNotificacion } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { ProjectsService } from '../projects/projects.service';
import { CreateAssignmentDto, QueryAssignmentsDto } from './dto/assignment.dto';
import { motivoTransicionInvalida, transicionValida } from './estado';

const ASSIGNMENT_INCLUDE = {
  project: { select: { id: true, nombre: true, sector: true, estado: true } },
  asignadoA: { select: { id: true, nombre: true, email: true, avatarUrl: true } },
  asignadoPor: { select: { id: true, nombre: true, email: true } },
  notificaciones: { include: { envios: true } },
} satisfies Prisma.AssignmentInclude;

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  findAll(q: QueryAssignmentsDto, user: RequestUser) {
    const soloMias = q.mias !== false;
    if (!soloMias && !user.permisos.includes('assignments.create')) {
      throw new ForbiddenException('Necesitas el permiso assignments.create para ver todas.');
    }

    return this.prisma.assignment.findMany({
      where: soloMias ? { asignadoAId: user.id } : {},
      include: ASSIGNMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Crea la asignación, la notificación y un registro de envío POR CANAL.
   * Los envíos quedan en 'pendiente': hay algo real esperando a que la fase 3
   * (n8n / Graph API) los despache. Ya no se miente con "Enviado (simulado)".
   */
  async create(dto: CreateAssignmentDto, user: RequestUser) {
    const [project, destinatario] = await Promise.all([
      // No basta con que el proyecto EXISTA: tiene que estar dentro del alcance
      // de quien asigna. Sin esta comprobacion, cualquier cuenta con
      // assignments.create podia asignarse a si misma cualquier proyecto de la
      // organizacion y con eso ganaba lectura del proyecto (el alcance incluye
      // "me lo asignaron") mas la capacidad de mover su etapa. Es decir,
      // assignments.create se convertia en un projects.viewAll de facto.
      this.prisma.project.findFirst({
        where: { AND: [{ id: dto.projectId }, this.projects.alcanceDe(user)] },
        select: { id: true, nombre: true },
      }),
      this.prisma.user.findUnique({
        where: { id: dto.asignadoAId },
        select: { id: true, email: true, telefono: true, activo: true },
      }),
    ]);
    // Mismo mensaje exista o no: quien no puede verlo tampoco tiene por que
    // enterarse de que existe.
    if (!project) throw new BadRequestException('El proyecto no existe.');
    if (!destinatario) throw new BadRequestException('La persona asignada no existe.');
    if (!destinatario.activo) throw new BadRequestException('La cuenta de esa persona está desactivada.');

    const envios = dto.canales.map(canal => {
      const necesitaTelefono = canal === Canal.whatsapp;
      const destino = necesitaTelefono ? (destinatario.telefono ?? '') : destinatario.email;
      return {
        canal,
        destino,
        // Si falta el dato de contacto lo decimos, en lugar de dar por enviado.
        estado: destino ? EnvioEstado.pendiente : EnvioEstado.no_configurado,
        detalle: destino ? null : 'La persona no tiene teléfono registrado en su perfil.',
      };
    });

    return this.prisma.assignment.create({
      data: {
        projectId: dto.projectId,
        asignadoAId: dto.asignadoAId,
        asignadoPorId: user.id,
        prioridad: dto.prioridad,
        nota: dto.nota ?? '',
        fechaLimite: dto.fechaLimite ? new Date(dto.fechaLimite) : null,
        canales: dto.canales,
        notificaciones: {
          create: {
            userId: dto.asignadoAId,
            tipo: TipoNotificacion.asignacion,
            titulo: 'Nuevo proyecto asignado',
            detalle: `Se te asignó “${project.nombre}” con prioridad ${dto.prioridad}.`,
            projectId: project.id,
            envios: { create: envios },
          },
        },
      },
      include: ASSIGNMENT_INCLUDE,
    });
  }

  async updateEstado(id: string, estado: AssignmentStatus, user: RequestUser) {
    const a = await this.prisma.assignment.findUnique({
      where: { id },
      select: { asignadoAId: true, estado: true },
    });
    if (!a) throw new NotFoundException('La asignación no existe.');

    const puede = a.asignadoAId === user.id || user.permisos.includes('assignments.create');
    if (!puede) throw new ForbiddenException('Solo la persona asignada puede mover el estado.');

    if (!transicionValida(a.estado, estado)) {
      throw new BadRequestException(motivoTransicionInvalida(a.estado, estado));
    }

    return this.prisma.assignment.update({
      where: { id },
      data: { estado },
      include: ASSIGNMENT_INCLUDE,
    });
  }
}
