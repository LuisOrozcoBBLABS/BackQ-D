-- Dos cambios que viajan juntos porque sirven al mismo pedido: que el equipo
-- comercial pueda consultar los proyectos y ver para que cliente es cada uno.
--
-- PostgreSQL 12+ admite ADD VALUE dentro de una transaccion siempre que el
-- valor nuevo NO SE USE en la misma transaccion. Por eso aca solo se declara el
-- valor del enum: la fila de la tabla `roles` con id = 'comercial' la crea el
-- seed, en otro proceso. Si se insertara aca, esta migracion fallaria.

-- 1. Rol de solo lectura para el equipo comercial.
ALTER TYPE "RoleId" ADD VALUE 'comercial' AFTER 'colaborador';

-- 2. Cliente del proyecto. Nullable a proposito: hay ideas internas sin cliente,
--    y una columna NOT NULL dejaria sin poder guardar todo lo ya cargado.
ALTER TABLE "projects" ADD COLUMN "cliente" TEXT;
