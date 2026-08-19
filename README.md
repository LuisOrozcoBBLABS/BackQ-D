# BackQ-D — API de la Plataforma I+D

Backend de la plataforma de Innovación y Desarrollo de Blackbird Labs (equipo QR&D).
Reemplaza la capa simulada que el front tenía en `localStorage`: acá viven los datos
reales, las credenciales y los permisos.

- **Stack:** NestJS 11 · Prisma 6 · PostgreSQL 16
- **Arquitectura:** Modular Monolith — un módulo por dominio en `src/modules/`,
  capas `controller → service → Prisma`, infraestructura en `src/infra/`.
- **Front:** [FrontQ-D](https://github.com/LuisOrozcoBBLABS/FrontQ-D) (Angular)

## Arrancar en local

1. **Base de datos.** Necesitas PostgreSQL 16 corriendo. Prisma crea la base si no existe.

2. **Variables de entorno.** Copiá el ejemplo y completá los valores:

   ```bash
   cp .env.example .env
   ```

   Hay que llenar tres cosas:
   - `DATABASE_URL` — usuario y clave de tu Postgres local.
   - `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` — dos cadenas aleatorias distintas.
   - `SEED_ADMIN_PASSWORD` — la clave del primer administrador (mínimo 10 caracteres).

   El `.env` está en `.gitignore` y **nunca** se comitea.

3. **Instalar, migrar y sembrar:**

   ```bash
   npm install
   ```

   ```bash
   npx prisma migrate dev
   ```

   ```bash
   npm run seed
   ```

4. **Levantar la API:**

   ```bash
   npm run start:dev
   ```

   - API: `http://localhost:3000/api`
   - Swagger: `http://localhost:3000/api/docs`
   - Health: `http://localhost:3000/api/health`

## Cómo está organizado

```
src/
├── main.ts              arranque
├── app.setup.ts         prefijo /api, helmet, CORS, validación, filtro de Prisma
├── app.module.ts        guards globales: throttler → jwt → permisos
├── common/              decoradores (@Public, @RequirePermission, @CurrentUser) y guards
├── infra/prisma/        PrismaService
└── modules/
    ├── auth/            login, refresh con rotación, logout, /me, cambio de clave
    ├── users/           CRUD, permisos extra, perfil propio, catálogo de permisos
    ├── groups/          CRUD e integrantes (Manglar, Delta, Bravo, Alpha)
    ├── projects/        CRUD, alcance por grupo, archivar, resultados de IA
    ├── assignments/     asignar con prioridad y canales
    ├── notifications/   bandeja propia, leídas
    └── health/
```

## Decisiones que conviene conocer

**Los permisos se evalúan en el servidor.** `JwtAuthGuard` arma `request.user` leyendo
los permisos efectivos (rol + extras) de la base en cada request. El front no puede
otorgarse permisos: antes, editar `localStorage` alcanzaba para volverse admin.

**Contraseñas con argon2id** (`@node-rs/argon2`, binario precompilado, sin node-gyp).
La API nunca devuelve contraseñas ni hashes. Login responde igual ante correo
inexistente y clave incorrecta, para no revelar qué correos existen.

**Refresh con rotación.** Cada refresh emite un par nuevo y guarda solo el hash del
token vigente. Si llega un refresh viejo, se cierran todas las sesiones de esa cuenta.

**Nada se borra.** Usuarios y grupos se desactivan; los proyectos se archivan
(`archivado`, `archivadoAt`). No hay `DELETE` destructivo en la API.

**Los envíos no mienten.** Cada notificación guarda un registro por canal con estado
real: `pendiente` (esperando al despachador), `enviado`, `fallido` o `no_configurado`
(por ejemplo, WhatsApp sin teléfono en el perfil). La versión anterior escribía
"Enviado (simulado)" sin enviar nada.

**Motor de IA: todavía no.** `PATCH /projects/:id/ai` guarda lo que el front calcule
hoy. En la fase 2 el cálculo se muda al backend, con la API key de OpenAI en el `.env`
del servidor — nunca en el front, donde quedaría expuesta en el bundle.

## Recuperar contraseña (sin correo)

`POST /auth/forgot-password` es público y responde **204 exista o no la cuenta**:
contestar distinto permitiría averiguar qué correos están registrados. Si existe,
registra un `PasswordResetRequest` y deja un aviso en la campana de cada
administrador activo. Si ya había un pedido pendiente, solo actualiza la nota en
lugar de acumular.

El administrador lo atiende desde el módulo de usuarios:

| Endpoint | Qué hace |
|---|---|
| `GET /reset-requests` | Pedidos pendientes, con la nota de la persona |
| `POST /users/:id/reset-password` | Asigna la clave temporal **y cierra el pedido** |
| `PATCH /reset-requests/:id/dismiss` | Descarta un pedido sin tocar la contraseña |

Restablecer marca `debeCambiarPassword`, borra el refresh token (se cierran las
sesiones abiertas) y deja constancia de quién atendió y cuándo. La persona entra
con la clave temporal y el `PasswordChangeGuard` no la deja operar hasta
cambiarla.

**La API nunca emite contraseñas.** La clave temporal la escribe el
administrador, que es quien se la va a comunicar; no viaja en ninguna respuesta
ni se genera en el servidor.

## Correo corporativo (Microsoft Graph)

Los avisos de asignación salen por correo desde un buzón del tenant. Hace falta
registrar una aplicación en Entra ID con el permiso de **aplicación** `Mail.Send`
y consentimiento de administrador, y acotar el remitente con
`New-ApplicationAccessPolicy` para que la app no pueda enviar como cualquier buzón.

Cuatro variables en el `.env`: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
`AZURE_CLIENT_SECRET` y `MAIL_FROM`.

Mientras estén vacías, el despachador deja los envíos en `pendiente` y avisa una
sola vez en el log. **Nada se pierde**: al configurarlas y reiniciar, los avisos
acumulados se envían solos.

Reintentos con espera creciente (1, 5, 15 y 60 minutos, hasta 5 intentos). El
despachador distingue lo transitorio (429, 5xx, red caída) de lo definitivo
(permiso mal otorgado, buzón inexistente), y a lo segundo no le insiste.
WhatsApp y Teams no están habilitados: sus envíos quedan marcados
`no_configurado` con el motivo, en lugar de mentir con un "enviado".

## Registro de cambios

| Rama | Qué cambió |
|---|---|
| `main` | Recuperación de contraseña mediada por un administrador: `POST /auth/forgot-password` público y sin revelar qué correos existen, solicitudes visibles en el módulo de usuarios, y el restablecimiento que cierra el pedido. Cinco tests del flujo. |
| `main` | MVP: clave temporal bloqueada en el servidor (`PasswordChangeGuard`), maquina de estados de asignaciones con transiciones validas, y 15 tests unitarios de estados y guards. |
| `main` | Fase 1: scaffold NestJS 11 + Prisma, esquema completo, auth JWT + argon2, módulos users / groups / projects / assignments / notifications / health, guards de permisos en servidor, seed idempotente. Envío de avisos por correo con Microsoft Graph: `MailService` con credenciales de aplicación, plantilla con la marca y despachador con cron, reintentos con espera creciente y estado real por canal. |
