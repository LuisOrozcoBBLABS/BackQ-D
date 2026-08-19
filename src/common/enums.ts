/**
 * Los enums de Prisma no admiten guiones, pero el contrato del front usa
 * 'en-curso' y 'prefiero-no-decirlo'. La traducción vive acá, en un solo lugar.
 */
export function enumToApi<T extends string>(valor: T): string {
  return valor.replace(/_/g, '-');
}

export function enumFromApi(valor: string): string {
  return valor.replace(/-/g, '_');
}
