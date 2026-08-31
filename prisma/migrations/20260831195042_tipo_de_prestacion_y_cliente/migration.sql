-- CreateEnum
CREATE TYPE "TipoPrestacion" AS ENUM ('talento', 'solucion');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "cliente" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tipoPrestacion" "TipoPrestacion";

-- CreateIndex
CREATE INDEX "projects_tipoPrestacion_idx" ON "projects"("tipoPrestacion");
