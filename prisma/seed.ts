import { PrismaClient, RoleId } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

/** Catálogo de permisos: el mismo que ya usaba el front. */
const PERMISOS = [
  { id: 'users.manage', label: 'Gestionar usuarios', desc: 'Crear, editar, activar/desactivar usuarios y asignar permisos.', grupo: 'Administración' },
  { id: 'roles.manage', label: 'Gestionar roles', desc: 'Definir permisos base de cada rol.', grupo: 'Administración' },
  { id: 'groups.manage', label: 'Gestionar grupos', desc: 'Crear grupos (Manglar, Delta…) y elegir integrantes.', grupo: 'Grupos' },
  { id: 'assignments.create', label: 'Asignar proyectos', desc: 'Asignar un proyecto a una persona con prioridad.', grupo: 'Grupos' },
  { id: 'projects.create', label: 'Crear proyectos', desc: 'Registrar nuevas ideas/proyectos de innovación.', grupo: 'Proyectos' },
  { id: 'projects.viewAll', label: 'Ver todos los proyectos', desc: 'Ver proyectos de todos los grupos, no solo los propios.', grupo: 'Proyectos' },
  { id: 'ai.use', label: 'Usar funciones de IA', desc: 'Enriquecer ideas, score, comité y búsqueda semántica.', grupo: 'IA' },
  { id: 'reports.view', label: 'Ver reportes', desc: 'Acceder a tableros e informes del área.', grupo: 'Reportes' },
];

/** Permisos base por rol. El admin (jefe de innovación) los tiene todos. */
const PERMISOS_POR_ROL: Record<RoleId, string[]> = {
  admin: PERMISOS.map(p => p.id),
  colaborador: ['projects.create', 'ai.use'],
  /**
   * Comercial: consulta, y nada mas.
   *
   * Un solo permiso, y es a proposito que no haya ningun bloqueo nuevo en
   * ningun lado. Las cinco rutas que escriben proyectos ya exigen o bien un
   * permiso que este rol no tiene (projects.create en POST, ai.use en
   * PATCH /:id/ai) o bien ser el autor o admin (update, archive, restore) o
   * tener el proyecto asignado (estado). Un comercial no es ninguna de esas
   * cosas, asi que la escritura le queda cerrada por construccion.
   *
   * Es mejor que agregar guardas: una guarda nueva se puede olvidar en el
   * endpoint siguiente. No tener el permiso no se olvida.
   *
   * NO lleva reports.view: eso da acceso a tableros e informes del area, que es
   * mas de lo que se pidio. Si mañana hace falta, se agrega aca y en ningun
   * otro lado.
   */
  comercial: ['projects.viewAll'],
};

const GRUPOS = [
  { nombre: 'Manglar', lema: 'Raíces firmes, crecimiento constante.' },
  { nombre: 'Delta', lema: 'Donde el cambio se vuelve cauce.' },
  { nombre: 'Bravo', lema: 'Primero en entrar, último en rendirse.' },
  { nombre: 'Alpha', lema: 'Lo que nadie ha probado, aquí se prueba.' },
];

async function main(): Promise<void> {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'luis.orozco@bblabs.io').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.length < 10) {
    throw new Error(
      'Falta SEED_ADMIN_PASSWORD en el .env (mínimo 10 caracteres).\n' +
        'El seed no inventa contraseñas ni las deja escritas en el repo.',
    );
  }

  for (const p of PERMISOS) {
    await prisma.permission.upsert({ where: { id: p.id }, update: p, create: p });
  }
  console.log(`Permisos: ${PERMISOS.length}`);

  const roles: { id: RoleId; label: string }[] = [
    { id: RoleId.admin, label: 'Administrador (Jefe de Innovación)' },
    { id: RoleId.colaborador, label: 'Colaborador' },
    { id: RoleId.comercial, label: 'Comercial (solo lectura)' },
  ];
  for (const rol of roles) {
    await prisma.role.upsert({ where: { id: rol.id }, update: { label: rol.label }, create: rol });

    // Reescribimos los permisos base del rol para que el seed sea idempotente.
    await prisma.rolePermission.deleteMany({ where: { roleId: rol.id } });
    await prisma.rolePermission.createMany({
      data: PERMISOS_POR_ROL[rol.id].map(permissionId => ({ roleId: rol.id, permissionId })),
    });
  }
  console.log(`Roles: ${roles.length}`);

  for (const g of GRUPOS) {
    await prisma.group.upsert({ where: { nombre: g.nombre }, update: { lema: g.lema }, create: g });
  }
  console.log(`Grupos: ${GRUPOS.length}`);

  const existente = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existente) {
    console.log(`Admin ya existe (${adminEmail}); no se toca su contraseña.`);
  } else {
    await prisma.user.create({
      data: {
        nombre: 'Luis Orozco',
        email: adminEmail,
        cargo: 'Jefe de Innovación',
        passwordHash: await hash(adminPassword),
        rolId: RoleId.admin,
        activo: true,
        onboardingCompleto: true,
        // El admin del seed elige su clave en el .env, así que no forzamos el cambio.
        debeCambiarPassword: false,
      },
    });
    console.log(`Admin creado: ${adminEmail}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
