-- CreateEnum
CREATE TYPE "RoleId" AS ENUM ('admin', 'colaborador');

-- CreateEnum
CREATE TYPE "Genero" AS ENUM ('hombre', 'mujer', 'prefiero_no_decirlo');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('idea', 'evaluacion', 'aprobado', 'descartado');

-- CreateEnum
CREATE TYPE "Prioridad" AS ENUM ('urgente', 'alta', 'media', 'baja');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('pendiente', 'aceptada', 'en_curso', 'completada');

-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('correo', 'whatsapp', 'teams');

-- CreateEnum
CREATE TYPE "EnvioEstado" AS ENUM ('pendiente', 'enviado', 'fallido', 'no_configurado');

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" "RoleId" NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" "RoleId" NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "concedidoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concedidoPor" TEXT,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cargo" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "rolId" "RoleId" NOT NULL DEFAULT 'colaborador',
    "groupId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "avatarUrl" TEXT,
    "linkedin" TEXT,
    "telefono" TEXT,
    "genero" "Genero",
    "fechaNacimiento" DATE,
    "onboardingCompleto" BOOLEAN NOT NULL DEFAULT false,
    "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT true,
    "refreshTokenHash" TEXT,
    "ultimoLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "lema" TEXT NOT NULL DEFAULT '',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "problema" TEXT NOT NULL DEFAULT '',
    "dolores" TEXT NOT NULL DEFAULT '',
    "solucion" TEXT NOT NULL DEFAULT '',
    "plusIA" TEXT NOT NULL DEFAULT '',
    "groupId" TEXT,
    "autorId" TEXT NOT NULL,
    "estado" "ProjectStatus" NOT NULL DEFAULT 'idea',
    "enriquecido" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER,
    "enrichment" JSONB,
    "archivado" BOOLEAN NOT NULL DEFAULT false,
    "archivadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_similars" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_similars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "asignadoAId" TEXT NOT NULL,
    "asignadoPorId" TEXT NOT NULL,
    "prioridad" "Prioridad" NOT NULL DEFAULT 'media',
    "nota" TEXT NOT NULL DEFAULT '',
    "fechaLimite" DATE,
    "estado" "AssignmentStatus" NOT NULL DEFAULT 'pendiente',
    "canales" "Canal"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "assignmentId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_envios" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "canal" "Canal" NOT NULL,
    "destino" TEXT NOT NULL,
    "estado" "EnvioEstado" NOT NULL DEFAULT 'pendiente',
    "detalle" TEXT,
    "intento" INTEGER NOT NULL DEFAULT 0,
    "enviadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_envios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_groupId_idx" ON "users"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "groups_nombre_key" ON "groups"("nombre");

-- CreateIndex
CREATE INDEX "projects_groupId_idx" ON "projects"("groupId");

-- CreateIndex
CREATE INDEX "projects_autorId_idx" ON "projects"("autorId");

-- CreateIndex
CREATE INDEX "projects_estado_idx" ON "projects"("estado");

-- CreateIndex
CREATE INDEX "project_similars_projectId_idx" ON "project_similars"("projectId");

-- CreateIndex
CREATE INDEX "assignments_asignadoAId_idx" ON "assignments"("asignadoAId");

-- CreateIndex
CREATE INDEX "assignments_projectId_idx" ON "assignments"("projectId");

-- CreateIndex
CREATE INDEX "notifications_userId_leida_idx" ON "notifications"("userId", "leida");

-- CreateIndex
CREATE INDEX "notification_envios_notificationId_idx" ON "notification_envios"("notificationId");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_similars" ADD CONSTRAINT "project_similars_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_asignadoAId_fkey" FOREIGN KEY ("asignadoAId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_asignadoPorId_fkey" FOREIGN KEY ("asignadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_envios" ADD CONSTRAINT "notification_envios_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
