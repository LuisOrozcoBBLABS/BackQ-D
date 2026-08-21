import { AssignmentStatus } from '@prisma/client';

/**
 * Transiciones válidas del estado de una asignación.
 *
 * Hacia adelante se avanza de a un paso: se aceptaba cualquier salto y se podía
 * pasar de `pendiente` a `completada` sin haber empezado, con lo que el
 * historial dejaba de significar algo.
 *
 * Hacia atrás también se vuelve de a un paso, `completada` incluida: dar algo
 * por terminado por error es común, y obligar a crear una asignación nueva para
 * corregirlo rompía la trazabilidad del trabajo real. Reabrir devuelve la
 * asignación a `en_curso`, que es donde estaba antes de cerrarse.
 */
const PERMITIDAS: Record<AssignmentStatus, AssignmentStatus[]> = {
  pendiente: [AssignmentStatus.aceptada],
  aceptada: [AssignmentStatus.en_curso, AssignmentStatus.pendiente],
  en_curso: [AssignmentStatus.completada, AssignmentStatus.aceptada],
  completada: [AssignmentStatus.en_curso], // se puede reabrir
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
