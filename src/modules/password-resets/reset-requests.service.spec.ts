import { NotFoundException } from '@nestjs/common';
import { EstadoSolicitud, RoleId } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ResetRequestsService } from './reset-requests.service';

/** Doble de Prisma con solo lo que toca este servicio. */
function prismaFalso(overrides: Record<string, unknown> = {}) {
  const base = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    passwordResetRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'sol-1' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
    },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return { ...base, ...overrides } as unknown as PrismaService;
}

const ana = { id: 'u-ana', nombre: 'Ana Gómez', email: 'ana@bblabs.io', activo: true };

describe('ResetRequestsService', () => {
  it('no crea nada si el correo no existe, y no lo delata', async () => {
    const prisma = prismaFalso();
    const svc = new ResetRequestsService(prisma);

    // No lanza: responder distinto permitiria averiguar que correos existen.
    await expect(svc.solicitar('nadie@bblabs.io')).resolves.toBeUndefined();
    expect(prisma.passwordResetRequest.create).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('registra el pedido y avisa a los administradores activos', async () => {
    const prisma = prismaFalso();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(ana);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'u-admin' }, { id: 'u-jefe' }]);

    const svc = new ResetRequestsService(prisma);
    await svc.solicitar('  ANA@bblabs.io  ', 'perdí la clave');

    // El correo se normaliza antes de buscar
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ana@bblabs.io' } }),
    );
    expect(prisma.passwordResetRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'u-ana', nota: 'perdí la clave' } }),
    );
    // Solo administradores, y solo activos
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { rolId: RoleId.admin, activo: true } }),
    );
    const avisos = (prisma.notification.createMany as jest.Mock).mock.calls[0][0].data;
    expect(avisos).toHaveLength(2);
    expect(avisos[0].detalle).toContain('ana@bblabs.io');
  });

  it('no acumula pedidos: si ya hay uno pendiente, solo actualiza la nota', async () => {
    const prisma = prismaFalso();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(ana);
    (prisma.passwordResetRequest.findFirst as jest.Mock).mockResolvedValue({ id: 'sol-vieja' });

    const svc = new ResetRequestsService(prisma);
    await svc.solicitar('ana@bblabs.io', 'sigo sin poder entrar');

    expect(prisma.passwordResetRequest.create).not.toHaveBeenCalled();
    expect(prisma.passwordResetRequest.update).toHaveBeenCalledWith({
      where: { id: 'sol-vieja' },
      data: { nota: 'sigo sin poder entrar' },
    });
    // Tampoco vuelve a llenar la campana de los admins
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('cerrar deja constancia de quién atendió y cuándo', async () => {
    const prisma = prismaFalso();
    const svc = new ResetRequestsService(prisma);

    const cerradas = await svc.cerrarDe('u-ana', 'u-admin');

    expect(cerradas).toBe(1);
    const args = (prisma.passwordResetRequest.updateMany as jest.Mock).mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'u-ana', estado: EstadoSolicitud.pendiente });
    expect(args.data.estado).toBe(EstadoSolicitud.atendida);
    expect(args.data.atendidaPorId).toBe('u-admin');
    expect(args.data.atendidaAt).toBeInstanceOf(Date);
  });

  it('descartar un pedido que no existe da 404', async () => {
    const prisma = prismaFalso();
    (prisma.passwordResetRequest.count as jest.Mock).mockResolvedValue(0);
    const svc = new ResetRequestsService(prisma);

    await expect(svc.descartar('no-existe', 'u-admin')).rejects.toThrow(NotFoundException);
  });
});
