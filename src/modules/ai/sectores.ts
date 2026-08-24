/**
 * Los sectores que ofrece el formulario del front.
 *
 * Duplican a conciencia la lista de FrontQ-D · src/app/core/models.ts (SECTORES),
 * porque acá se necesitan para dos cosas que no pueden salir del front: el `enum`
 * del responseSchema que se le manda al modelo, y el saneador de su respuesta.
 *
 * La duplicación está cubierta por sectores.spec.ts, que los afirma verbatim: si
 * alguien los cambia de un lado sin avisar del otro se rompe un test, en vez de
 * romperse el <select> en producción.
 */
export const SECTORES = [
  'Logística',
  'Retail / E-commerce',
  'Finanzas',
  'Fintech',
  'Salud',
  'Educación',
  'Farma',
  'Otro',
] as const;

export type Sector = (typeof SECTORES)[number];

/** Cuando nada coincide. El modelo no puede inventar un sector nuevo. */
export const SECTOR_POR_DEFECTO: Sector = 'Otro';

/**
 * Sinónimos que el modelo usa de verdad. No es un diccionario: son los términos
 * que aparecen en documentos reales y que no coinciden por texto con la lista.
 */
const SINONIMOS: Record<string, Sector> = {
  banca: 'Finanzas',
  bancario: 'Finanzas',
  seguros: 'Finanzas',
  insurtech: 'Finanzas',
  financiero: 'Finanzas',
  pagos: 'Fintech',
  pharma: 'Farma',
  farmaceutico: 'Farma',
  farmaceutica: 'Farma',
  edtech: 'Educación',
  educativo: 'Educación',
  transporte: 'Logística',
  logistico: 'Logística',
  supplychain: 'Logística',
  'supply chain': 'Logística',
  ecommerce: 'Retail / E-commerce',
  'e commerce': 'Retail / E-commerce',
  comercio: 'Retail / E-commerce',
  retail: 'Retail / E-commerce',
  healthtech: 'Salud',
  salud: 'Salud',
  medico: 'Salud',
  sanitario: 'Salud',
};

/** Plegado para comparar: sin mayúsculas, sin tildes, sin puntuación de sobra. */
function plegar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Devuelve siempre uno de los ocho literales. `exacto` dice si el valor entraba
 * tal cual, para que el saneador pueda avisarle a la persona que se cambió.
 */
export function normalizarSector(crudo: unknown): { sector: Sector; exacto: boolean } {
  if (typeof crudo !== 'string') return { sector: SECTOR_POR_DEFECTO, exacto: false };

  const exacto = SECTORES.find(s => s === crudo);
  if (exacto) return { sector: exacto, exacto: true };

  const plegado = plegar(crudo);
  if (!plegado) return { sector: SECTOR_POR_DEFECTO, exacto: false };

  const porPlegado = SECTORES.find(s => plegar(s) === plegado);
  if (porPlegado) return { sector: porPlegado, exacto: false };

  const sinonimo = SINONIMOS[plegado];
  if (sinonimo) return { sector: sinonimo, exacto: false };

  return { sector: SECTOR_POR_DEFECTO, exacto: false };
}
