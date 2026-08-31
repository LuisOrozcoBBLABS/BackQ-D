# BackQ-D — API de la Plataforma R&D

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

## Testing

```bash
npm test   # Jest, 20 tests
```

Los specs usan un doble de Prisma (`prismaFalso`), así que **no hace falta una
base de datos** para correrlos. Cubren la máquina de estados de asignaciones,
`PasswordChangeGuard`, `PermissionsGuard` y el flujo de restablecimiento.

El chequeo de tipos vale por sí solo, y no solo por prolijidad: la lista blanca
del ordenamiento se apoya en el tipo `CampoOrdenableUsuario`, que excluye
`passwordHash` y `refreshTokenHash`. Meter uno de esos campos en
`ORDEN_USUARIOS` no compila.

```bash
npx prisma generate   # imprescindible: el paquete no tiene postinstall
npx tsc --noEmit
```

Las dos cosas corren solas en cada pull request desde
`.github/workflows/ci.yml`. Ese workflow **no toca ninguna base y no corre
migraciones**: acá las migraciones son siempre un paso manual y revisado.

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
(`archivado`, `archivadoAt`). No hay `DELETE` destructivo en la API. Lo que la
interfaz llama "eliminar" es ese archivado: el proyecto sale de las listas y del
tablero, y `PATCH /projects/:id/restore` lo devuelve con su historial intacto.

**Quién puede qué sobre un proyecto.** Tres permisos distintos, a propósito:

| Operación | Quién |
|---|---|
| Ver | Autor, su grupo, **quien lo tiene asignado**, o `projects.viewAll` |
| Mover etapa (`PATCH /projects/:id/estado`) | Autor, administrador o **quien lo tiene a cargo** |
| Editar y eliminar (`PATCH /projects/:id`, `/archive`) | Autor o administrador |

Mover una tarjeta del tablero y editar el contenido del proyecto no son lo mismo:
quien ejecuta el trabajo avanza su etapa, pero no reescribe la propuesta de otro.

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

## Etapas del proyecto y sus tiempos

`ProjectStatus` es **un solo flujo de punta a punta**, no dos listas separadas:

| Fase | Etapas |
|---|---|
| Embudo de innovación | `idea` · `evaluacion` · `aprobado` |
| Ciclo de desarrollo | `analisis_diseno` · `desarrollo` · `code_review_qa` · `uat` · `listo_despliegue` |
| Cierre | `produccion` |
| Fuera del flujo | `descartado` |

Los valores llevan guion bajo, igual que en Prisma. A diferencia de las
asignaciones —que usan guion medio en la API y se convierten— acá no hay
conversión: `@IsEnum(ProjectStatus)` los acepta tal cual y el front manda esos
mismos literales.

**`project_status_changes` registra cada entrada a una etapa.** Sin esa tabla no
se puede responder "cuánto lleva en desarrollo": `updatedAt` se mueve con
cualquier edición. Cada fila guarda la etapa, de dónde venía, quién la movió y
cuándo. Se escribe en la misma transacción que el `update`, así nunca queda un
estado sin su fecha de entrada, y también al crear el proyecto, para que su
etapa inicial tenga origen.

La migración `20260820170000_pipeline_e_historial_de_estados` siembra una fila
por cada proyecto que ya existía, con su fecha de creación y atribuida al autor:
sin ese relleno, el tablero no podría calcular tiempos para nada de lo cargado.

Las listas traen **solo la última** entrada (la tarjeta necesita saber desde
cuándo está en su etapa); el detalle trae el historial completo con quién movió
cada una.

## Filtros de proyectos

Además de `q`, `sector`, `estado` y `groupId`, la lista acepta filtros sobre las
asignaciones y las fechas:

| Parámetro | Qué filtra |
|---|---|
| `asignadoAMi` | Solo lo que tiene a cargo quien pregunta. Es el alcance del tablero |
| `asignadoA` · `asignadoPor` | Por responsable o por quien asignó |
| `prioridad` · `estadoAsignacion` | De la asignación, no del proyecto |
| `vencidos` | Con plazo pasado y sin cerrar; una completada tarde ya no urge |
| `sinAsignar` | Sin nadie a cargo |
| `desde` · `hasta` | Rango de fecha de registro, extremos inclusivos |

Las condiciones sobre asignaciones van juntas dentro de **un solo `some`**:
pedir "urgente" y "asignado a mí" no puede resolverse con una urgente de otra
persona más una mía tranquila. Todos los filtros pasan por el mismo método
privado que usan la lista, el conteo y `stats`, para que las cifras del
encabezado no se desalineen con las filas.

## Paginación

Las listas de `/users` y `/projects` devuelven el total que cumple los filtros en
la cabecera **`X-Total-Count`**, y aceptan `skip` / `take`. El front pide de a 8
filas y numera las páginas con ese total. Sin el total no se pueden numerar
páginas, y sin filtrar en el servidor la búsqueda solo miraría la página cargada.

`GET /projects/stats` devuelve cuántos proyectos hay en cada estado dentro del
alcance de quien pregunta, ignorando el filtro de estado: así las pastillas
siguen mostrando el total de cada uno aunque haya un filtro puesto.

`exposedHeaders: ['X-Total-Count']` en el CORS es imprescindible: sin eso el
navegador oculta la cabecera y el front no puede paginar.

## Registro de cambios

| Rama | Qué cambió |
|---|---|
| `feat/pipeline-y-permisos` | **Tres correcciones de seguridad.** `POST /assignments` comprobaba que el proyecto existiera, no que quien asigna pudiera verlo: como el alcance de lectura incluye «me lo asignaron», cualquier cuenta con `assignments.create` podía asignarse cualquier proyecto de la organización y ganar lectura más capacidad de mover su etapa — el permiso funcionaba como un `projects.viewAll` de facto. Faltaba `trust proxy`, y sin él el límite de login de 5/min era global: cinco peticiones por minuto dejaban sin login a toda el área. Y el `orderBy` no tenía desempate, así que la paginación devolvía filas repetidas y salteadas (con `sort=estado`, que tiene 10 valores, era casi aleatorio). |
| `feat/pipeline-y-permisos` | **CI en cada pull request** (`ci.yml`): cliente de Prisma, tipos y los 20 tests. Sin base de datos y sin correr migraciones — acá siguen siendo un paso manual y revisado. |
| `feat/pipeline-y-permisos` | Orden en el servidor con lista blanca en proyectos y usuarios (`sort` + `dir`). El tipo `CampoOrdenableUsuario` excluye `passwordHash` y `refreshTokenHash`, así que meter uno de esos en la lista falla al compilar: ordenar por una columna que nunca se devuelve es un oráculo. `ultimoLoginAt` y `cargo` ordenan con `nulls: 'last'`, porque en PostgreSQL los NULL van primero en DESC y «último ingreso más reciente arriba» devolvía primero a quien nunca entró. |
| `feat/pipeline-y-permisos` | La tabla de transiciones de asignaciones queda avisada de que está espejada en el front, con el caso que ya se desincronizó: el front tenía `completada: ['en-curso']` mientras acá es `[]`, así que la interfaz ofrecía reabrir y el servidor lo rechazaba. |
| `main` | Editar y eliminar quedan restringidos al autor (o administrador), separados del permiso de mover etapa, y documentada la matriz de permisos por operación. |
| `main` | Tablero de punta a punta: `ProjectStatus` pasa de 4 a 10 etapas (embudo + ciclo de desarrollo), nueva tabla `project_status_changes` con el historial por etapa, y filtros de proyectos por asignación, prioridad, estado de la asignación, vencidos y rango de fechas. |
| `main` | Nomenclatura del área: **I+D** pasa a **R&D** en el título de Swagger, la plantilla de correo, la descripción del paquete y los comentarios del esquema. |
| `main` | Paginación en el servidor: `X-Total-Count` en las listas de usuarios y proyectos, `GET /projects/stats` para los conteos por estado, y `tipo` + `sujetoId` en las notificaciones para que el clic lleve a la acción. |
| `main` | Recuperación de contraseña mediada por un administrador: `POST /auth/forgot-password` público y sin revelar qué correos existen, solicitudes visibles en el módulo de usuarios, y el restablecimiento que cierra el pedido. Cinco tests del flujo. |
| `main` | MVP: clave temporal bloqueada en el servidor (`PasswordChangeGuard`), maquina de estados de asignaciones con transiciones validas, y 15 tests unitarios de estados y guards. |
| `main` | Fase 1: scaffold NestJS 11 + Prisma, esquema completo, auth JWT + argon2, módulos users / groups / projects / assignments / notifications / health, guards de permisos en servidor, seed idempotente. Envío de avisos por correo con Microsoft Graph: `MailService` con credenciales de aplicación, plantilla con la marca y despachador con cron, reintentos con espera creciente y estado real por canal. |
