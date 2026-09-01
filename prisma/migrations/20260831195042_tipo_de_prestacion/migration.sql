-- Que le presta la empresa en cada proyecto: gente (talento) o el producto
-- terminado (solucion).
--
-- La columna `cliente` NO se crea aca aunque naciera junto a esta: la agrega
-- `20260901120000_cliente_y_rol_comercial`, de la rama QA, que llego con la
-- misma necesidad y la resolvio como NULLABLE. Se dejo la version de QA porque
-- es la que va a main, y "sin cliente" y "cliente en blanco" son el mismo
-- hecho: dos representaciones para lo mismo obligan a cualquier filtro futuro a
-- preguntar por las dos.

-- CreateEnum
CREATE TYPE "TipoPrestacion" AS ENUM ('talento', 'solucion');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "tipoPrestacion" "TipoPrestacion";

-- CreateIndex
CREATE INDEX "projects_tipoPrestacion_idx" ON "projects"("tipoPrestacion");
