-- CreateEnum
CREATE TYPE "TipoEvidencia" AS ENUM ('imagen', 'video', 'despliegue', 'documento');

-- CreateTable
CREATE TABLE "project_evidences" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tipo" "TipoEvidencia" NOT NULL,
    "titulo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_evidences_projectId_idx" ON "project_evidences"("projectId");

-- AddForeignKey
ALTER TABLE "project_evidences" ADD CONSTRAINT "project_evidences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
