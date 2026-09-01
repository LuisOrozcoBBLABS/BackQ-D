/**
 * Exporta a JSON los datos de la API de produccion.
 *
 * POR QUE EXISTE: la instancia de produccion quedo bajo una cuenta personal a
 * la que la empresa ya no tiene acceso. El codigo se puede volver a desplegar;
 * los datos, no. Esto los baja mientras la API siga respondiendo.
 *
 * Es de SOLO LECTURA. No escribe nada en la API: solo hace GET y guarda.
 *
 * EL TOKEN NO SE ESCRIBE ACA NI SE PASA POR ARGUMENTO. Se lee de una variable
 * de entorno, asi no queda en el historial de la terminal ni en el repositorio.
 *
 *   $env:API_TOKEN = "<tu access token>"
 *   node scripts/exportar-produccion.mjs
 *
 * Para obtener el token: entra a la plataforma, abri las herramientas del
 * navegador (F12) → Application → Local Storage → y copia el access token.
 * Dura 15 minutos; si el script falla con 401, sacá uno nuevo.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const API = process.env.API_URL ?? 'https://backq-d.onrender.com/api';
const TOKEN = process.env.API_TOKEN;

if (!TOKEN) {
  console.error('Falta API_TOKEN. Ver el comentario de arriba: se pasa por variable de entorno,');
  console.error('no por argumento, para que no quede en el historial de la terminal.');
  process.exit(1);
}

const cabeceras = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' };

async function pedir(ruta) {
  const r = await fetch(`${API}${ruta}`, { headers: cabeceras });
  if (r.status === 401) throw new Error('401: el token vencio o no es valido. Sacá uno nuevo.');
  if (!r.ok) throw new Error(`${r.status} en ${ruta}`);
  return r.json();
}

/** Recorre todas las paginas. El tope del servidor es 200 por pagina. */
async function todo(ruta) {
  const acumulado = [];
  const TAMANO = 200;
  for (let skip = 0; ; skip += TAMANO) {
    const sep = ruta.includes('?') ? '&' : '?';
    const pagina = await pedir(`${ruta}${sep}skip=${skip}&take=${TAMANO}`);
    const filas = Array.isArray(pagina) ? pagina : (pagina.items ?? []);
    acumulado.push(...filas);
    if (filas.length < TAMANO) return acumulado;
  }
}

const DESTINO = new URL('../export-produccion', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const FUENTES = [
  ['proyectos', () => todo('/projects')],
  ['usuarios', () => todo('/users')],
  ['grupos', () => pedir('/groups?estado=todos')],
  ['asignaciones', () => pedir('/assignments?mias=false')],
  ['roles', () => pedir('/roles')],
  ['permisos', () => pedir('/permissions')],
];

mkdirSync(DESTINO, { recursive: true });
console.log('Exportando desde', API);

let fallaron = 0;
for (const [nombre, traer] of FUENTES) {
  try {
    const datos = await traer();
    const n = Array.isArray(datos) ? datos.length : 1;
    writeFileSync(`${DESTINO}/${nombre}.json`, JSON.stringify(datos, null, 2), 'utf8');
    console.log(`  ${nombre.padEnd(14)} ${String(n).padStart(5)} registros`);
  } catch (e) {
    // Una fuente que falla no puede tirar abajo el resto: si el token vence a
    // mitad de camino, lo ya bajado se conserva.
    fallaron++;
    console.error(`  ${nombre.padEnd(14)} FALLO: ${e.message}`);
  }
}

console.log('\nGuardado en', DESTINO);
if (fallaron) {
  console.error(`${fallaron} fuente(s) fallaron. Revisá el token y volvé a correrlo: reescribe lo que baje.`);
  process.exit(1);
}
