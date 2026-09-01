/**
 * Importa a la instancia NUEVA lo que exporto scripts/exportar-produccion.mjs.
 *
 * ORDEN: primero corre el exportador contra la instancia vieja, y despues este
 * contra la nueva. Lee los JSON de export-produccion/.
 *
 *   $env:API_URL   = "https://backq-d-y6sq.onrender.com/api"
 *   $env:API_TOKEN = "<token de admin de la instancia NUEVA>"
 *   $env:IMPORT_TEMP_PASSWORD = "<contrasena temporal, minimo 10>"
 *   node scripts/importar-produccion.mjs
 *
 * LO QUE NO SE PUEDE TRAER, Y CONVIENE SABERLO ANTES DE CORRERLO:
 *
 * - Contraseñas. La API nunca devuelve el hash, asi que no hay de donde
 *   sacarlas. Cada persona entra con IMPORT_TEMP_PASSWORD y la plataforma le
 *   exige cambiarla en el primer ingreso (debeCambiarPassword queda en true).
 * - Autoria de los proyectos. `create` fuerza autorId = quien hace la peticion
 *   (projects.service.ts), asi que TODOS los proyectos van a figurar creados por
 *   la cuenta que corra este script. No hay forma de evitarlo por la API.
 * - Fechas de creacion. Se ponen en el momento de la importacion. Los "nuevos
 *   en 7 dias" del panel y los tiempos por etapa arrancan de cero.
 * - Historial de etapas. Solo queda la fila inicial que crea el propio alta.
 *
 * Lo que SI se conserva: nombre, sector, cliente, tipo de prestacion, problema,
 * dolores, solucion, plusIA, etapa del pipeline, grupo, apps parecidas, y de
 * las personas su nombre, correo, cargo, rol y grupo.
 *
 * OJO al agregar una columna al proyecto: hay que sumarla ACA tambien. El
 * cuerpo se arma campo por campo —no es un spread del objeto de origen— asi que
 * una columna nueva no viaja y no falla nada: el proyecto se crea igual, con
 * ese dato en blanco, y el silencio es justo el problema.
 *
 * Es reentrante: lo que ya existe se saltea, asi que se puede volver a correr
 * si se corta a la mitad.
 */
import { readFileSync, existsSync } from 'node:fs';

const API = process.env.API_URL;
const TOKEN = process.env.API_TOKEN;
const TEMP = process.env.IMPORT_TEMP_PASSWORD;

if (!API || !TOKEN || !TEMP) {
  console.error('Faltan variables. Ver el comentario de arriba.');
  console.error('  API_URL, API_TOKEN, IMPORT_TEMP_PASSWORD');
  process.exit(1);
}
if (TEMP.length < 10) {
  console.error('IMPORT_TEMP_PASSWORD necesita al menos 10 caracteres: la API los exige.');
  process.exit(1);
}

const ORIGEN = new URL('../export-produccion', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const leer = n => {
  const f = `${ORIGEN}/${n}.json`;
  if (!existsSync(f)) {
    console.error(`Falta ${f}. Corré primero scripts/exportar-produccion.mjs contra la instancia vieja.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(f, 'utf8'));
};

const cabeceras = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  if (r.status === 401) throw new Error('401: el token de la instancia NUEVA vencio o no es valido.');
  if (!r.ok) {
    const e = new Error(`${r.status} ${texto.slice(0, 200)}`);
    e.status = r.status;
    throw e;
  }
  return texto ? JSON.parse(texto) : null;
}

// Se leen los dos archivos ANTES de tocar la red: si falta el export, el aviso
// tiene que ser "corré primero el exportador" y no un error de conexion con
// stack trace, que manda a buscar el problema al lado equivocado.
const usuariosOrigen = leer('usuarios');
const proyectosOrigen = leer('proyectos');

// --- Grupos: el seed ya creo los cuatro, asi que se mapean por nombre. --------
const gruposDestino = await api('GET', '/groups?estado=todos');
const idDeGrupo = new Map(gruposDestino.map(g => [g.nombre, g.id]));
console.log(`Grupos en destino: ${gruposDestino.length} (${[...idDeGrupo.keys()].join(', ')})`);

// --- Personas ----------------------------------------------------------------
const usuariosDestino = await api('GET', '/users?take=200');
const yaExiste = new Map(
  (usuariosDestino.items ?? usuariosDestino).map(u => [u.email.toLowerCase(), u.id]),
);

// old id -> new id, para poder reasignar despues.
const mapaUsuarios = new Map();
let altas = 0, saltados = 0, fallidos = 0;

for (const u of usuariosOrigen) {
  const correo = u.email.toLowerCase();
  if (yaExiste.has(correo)) {
    mapaUsuarios.set(u.id, yaExiste.get(correo));
    saltados++;
    continue;
  }
  try {
    const creado = await api('POST', '/users', {
      nombre: u.nombre,
      email: u.email,
      cargo: u.cargo ?? undefined,
      password: TEMP,
      rol: u.rol ?? 'colaborador',
      groupId: u.grupo?.nombre ? (idDeGrupo.get(u.grupo.nombre) ?? null) : null,
    });
    mapaUsuarios.set(u.id, creado.id);
    altas++;
  } catch (e) {
    fallidos++;
    console.error(`  usuario ${u.email}: ${e.message}`);
  }
}
console.log(`Personas: ${altas} creadas, ${saltados} ya estaban, ${fallidos} fallaron`);

// --- Proyectos ---------------------------------------------------------------
const proyectosDestino = await api('GET', '/projects?take=200');
const nombresDestino = new Set((proyectosDestino.items ?? proyectosDestino).map(p => p.nombre));

let pAltas = 0, pSaltados = 0, pFallidos = 0;

for (const p of proyectosOrigen) {
  if (nombresDestino.has(p.nombre)) { pSaltados++; continue; }
  try {
    await api('POST', '/projects', {
      nombre: p.nombre,
      sector: p.sector,
      // El DTO omite lo que llegue en undefined; mandar null seria un 400 en
      // `cliente`, que es @IsString cuando esta presente.
      cliente: p.cliente ?? undefined,
      tipoPrestacion: p.tipoPrestacion ?? undefined,
      problema: p.problema ?? undefined,
      dolores: p.dolores ?? undefined,
      solucion: p.solucion ?? undefined,
      plusIA: p.plusIA ?? undefined,
      estado: p.estado,
      groupId: p.grupo?.nombre ? (idDeGrupo.get(p.grupo.nombre) ?? null) : null,
      similares: p.similares?.length
        ? p.similares.map(s => ({ name: s.name, url: s.url }))
        : undefined,
    });
    pAltas++;
  } catch (e) {
    pFallidos++;
    console.error(`  proyecto "${p.nombre}": ${e.message}`);
  }
}
console.log(`Proyectos: ${pAltas} creados, ${pSaltados} ya estaban, ${pFallidos} fallaron`);

console.log('\nListo.');
console.log('Las personas importadas entran con la contraseña temporal y la plataforma');
console.log('les va a exigir cambiarla en el primer ingreso.');
if (fallidos || pFallidos) process.exit(1);
