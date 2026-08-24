-- Tablero de punta a punta: el enum de estados pasa del embudo de innovacion
-- (4 etapas) a un solo flujo que incluye el ciclo de desarrollo (10 etapas),
-- y aparece la tabla que registra cada entrada a una etapa.
--
-- PostgreSQL 12+ admite ADD VALUE dentro de una transaccion siempre que el
-- valor nuevo no se use en la misma transaccion. Aca no se usa: la tabla se
-- crea vacia y el relleno inserta unicamente estados que ya existian.

-- 1. Etapas nuevas, en orden, despues de 'aprobado': el orden del enum queda
--    igual al del flujo real y 'descartado' sigue al final.
ALTER TYPE "ProjectStatus" ADD VALUE 'analisis_diseno'  AFTER 'aprobado';
ALTER TYPE "ProjectStatus" ADD VALUE 'desarrollo'       AFTER 'analisis_diseno';
ALTER TYPE "ProjectStatus" ADD VALUE 'code_review_qa'   AFTER 'desarrollo';
ALTER TYPE "ProjectStatus" ADD VALUE 'uat'              AFTER 'code_review_qa';
ALTER TYPE "ProjectStatus" ADD VALUE 'listo_despliegue' AFTER 'uat';
ALTER TYPE "ProjectStatus" ADD VALUE 'produccion'       AFTER 'listo_despliegue';

-- 2. Historial de etapas.
CREATE TABLE "project_status_changes" (
    "id"        TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estado"    "ProjectStatus" NOT NULL,
    "anterior"  "ProjectStatus",
    "porId"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_status_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_status_changes_projectId_createdAt_idx"
    ON "project_status_changes"("projectId", "createdAt");

ALTER TABLE "project_status_changes"
    ADD CONSTRAINT "project_status_changes_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_status_changes"
    ADD CONSTRAINT "project_status_changes_porId_fkey"
    FOREIGN KEY ("porId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Relleno de los proyectos que ya existian: una fila con su estado actual y
--    su fecha de creacion, atribuida al autor. Sin esto el tablero no podria
--    decir hace cuanto esta en su etapa para nada de lo ya cargado.
INSERT INTO "project_status_changes" ("id", "projectId", "estado", "anterior", "porId", "createdAt")
SELECT gen_random_uuid()::text, "id", "estado", NULL, "autorId", "createdAt"
FROM "projects";
