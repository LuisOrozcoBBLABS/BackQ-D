import { AssignmentStatus } from '@prisma/client';

/**
 * Transiciones válidas del estado de una asignación. Antes se aceptaba cualquier
 * salto: se podía pasar de `pendiente` a `completada` sin haber empezado, y el
 * historial dejaba de significar algo.
 */
const PERMITIDAS: Record<AssignmentStatus, AssignmentStatus[]> = {
  pendiente: [AssignmentStatus.aceptada],
  aceptada: [AssignmentStatus.en_curso, AssignmentStatus.pendiente],
  en_curso: [AssignmentStatus.completada, AssignmentStatus.aceptada],
  completada: [], // estado final
};

export function transicionValida(desde: AssignmentStatus, hasta: AssignmentStatus): boolean {
  if (desde === hasta) return true; // reenviar el mismo estado no es un error
  return PERMITIDAS[desde].includes(hasta);
}

/** Mensaje para el usuario, no para el log: dice qué sí se puede hacer. */
export function motivoTransicionInvalida(
  desde: AssignmentStatus,
  hasta: AssignmentStatus,
): string {
  const etiqueta: Record<AssignmentStatus, string> = {
    pendiente: 'pendiente',
    aceptada: 'aceptada',
    en_curso: 'en curso',
    completada: 'completada',
  };

  const posibles = PERMITIDAS[desde];
  if (!posibles.length) {
    return `La asignación ya está ${etiqueta[desde]} y no admite más cambios.`;
  }
  return (
    `No se puede pasar de ${etiqueta[desde]} a ${etiqueta[hasta]}. ` +
    `Desde ${etiqueta[desde]} solo se puede ir a ${posibles.map(p => etiqueta[p]).join(' o ')}.`
  );
}
