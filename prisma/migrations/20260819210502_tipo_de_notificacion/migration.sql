-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('asignacion', 'reset_password', 'general');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "tipo" "TipoNotificacion" NOT NULL DEFAULT 'general';
