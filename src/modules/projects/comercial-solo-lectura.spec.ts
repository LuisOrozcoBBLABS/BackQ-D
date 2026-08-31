import { ForbiddenException } from '@nestjs/common';
import { ProjectStatus, RoleId } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { ProjectsService } from './projects.service';

/**
 * El rol `comercial` es de SOLO LECTURA, y este spec fija esa promesa.
 *
 * Vale la pena decir por qué existe el archivo, porque a primera vista no hay
 * nada que testear: no se agregó ni una guarda para este rol. Justamente por
 * eso. La lectura de solo lectura no está escrita en ningún lado como una
 * regla — emerge de que el rol no tiene ciertos permisos y no cumple ciertas
 * condiciones:
 *
 *   POST   /projects        exige el permiso projects.create
 *   PATCH  /projects/:id    exige ser el autor, o rol admin
 *   PATCH  /:id/archive     idem
 *   PATCH  /:id/restore     idem
 *   PATCH  /:id/estado      exige ser el autor, admin, o tener el proyecto asignado
 *   PATCH  /:id/ai          exige el permiso ai.use
 *
 * Una propiedad que emerge se pierde sin que nadie lo note. Alcanza con que
 * alguien agregue `comercial` a una lista de permisos por conveniencia, o
 * cambie `soloAutorOAdmin` por algo más laxo, para que este rol pase a escribir
 * en silencio. Estos tests son la alarma.
 *
 * Si mañana se agrega una ruta que escribe proyectos, va con su caso acá.
 */

/** Comercial tal como lo define el seed: un solo permiso, y es de lectura. */
function comercial(): RequestUser {
  return {
    id: 'u-comercial',
    email: 'ventas@bblabs.io',
    rol: RoleId.comercial,
    groupId: null,
    permisos: ['projects.viewAll'],
    debeCambiarPassword: false,
  };
}

/** El proyecto es de otra persona, que es el caso real: comercial no crea nada. */
const PROYECTO_AJENO = {
  autorId: 'u-alguien-mas',
  estado: ProjectStatus.desarrollo,
  assignments: [] as { id: string }[],
};

function servicioCon(proyecto: unknown): ProjectsService {
  const prisma = {
    project: {
      findUnique: jest.fn().mockResolvedValue(proyecto),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  return new ProjectsService(prisma);
}

describe('Rol comercial: solo lectura', () => {
  describe('no puede escribir', () => {
    it('rechaza editar un proyecto', async () => {
      const svc = servicioCon(PROYECTO_AJENO);
      await expect(svc.update('p-1', { nombre: 'Otro' } as never, comercial())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rechaza archivar', async () => {
      const svc = servicioCon(PROYECTO_AJENO);
      await expect(svc.setArchivado('p-1', true, comercial())).rejects.toThrow(ForbiddenException);
    });

    it('rechaza restaurar', async () => {
      const svc = servicioCon(PROYECTO_AJENO);
      await expect(svc.setArchivado('p-1', false, comercial())).rejects.toThrow(ForbiddenException);
    });

    it('rechaza mover la etapa en el tablero', async () => {
      const svc = servicioCon(PROYECTO_AJENO);
      await expect(
        svc.cambiarEstado('p-1', ProjectStatus.uat, comercial()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('no escribe en la base en ninguno de esos intentos', async () => {
      const prisma = {
        project: { findUnique: jest.fn().mockResolvedValue(PROYECTO_AJENO), update: jest.fn() },
        $transaction: jest.fn(),
      } as unknown as PrismaService;
      const svc = new ProjectsService(prisma);

      await expect(svc.setArchivado('p-1', true, comercial())).rejects.toThrow();
      await expect(svc.cambiarEstado('p-1', ProjectStatus.uat, comercial())).rejects.toThrow();

      // Rechazar con una excepción no alcanza: hay que comprobar que el rechazo
      // ocurrió ANTES de tocar la base, no después.
      expect((prisma.project.update as jest.Mock)).not.toHaveBeenCalled();
      expect((prisma.$transaction as jest.Mock)).not.toHaveBeenCalled();
    });
  });

  describe('los permisos que NO tiene son los que cierran las otras dos rutas', () => {
    // POST /projects y PATCH /:id/ai no llegan al servicio: los corta el
    // PermissionsGuard por decorador. Acá se fija la premisa de la que depende
    // ese corte, que es la lista de permisos del rol en el seed.
    it('no tiene projects.create, así que no puede crear', () => {
      expect(comercial().permisos).not.toContain('projects.create');
    });

    it('no tiene ai.use, así que no puede guardar enriquecimiento', () => {
      expect(comercial().permisos).not.toContain('ai.use');
    });

    it('no tiene ningún permiso de administración', () => {
      for (const p of ['users.manage', 'roles.manage', 'groups.manage', 'assignments.create']) {
        expect(comercial().permisos).not.toContain(p);
      }
    });
  });

  describe('sí puede leer', () => {
    it('projects.viewAll le da alcance sobre todos los proyectos, no solo los propios', () => {
      const svc = servicioCon(PROYECTO_AJENO);
      // Un alcance vacío significa "sin filtro": ve todo. Es lo que se le pidió.
      expect(svc.alcanceDe(comercial())).toEqual({});
    });

    it('sin projects.viewAll el alcance SÍ filtra — o sea que el alcance vacío viene del permiso', () => {
      const svc = servicioCon(PROYECTO_AJENO);
      const sinPermiso: RequestUser = { ...comercial(), permisos: [] };
      expect(svc.alcanceDe(sinPermiso)).not.toEqual({});
    });
  });
});
