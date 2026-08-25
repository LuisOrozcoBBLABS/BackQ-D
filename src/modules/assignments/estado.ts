import { AssignmentStatus } from '@prisma/client';

/**
 * Transiciones válidas del estado de una asignación. Antes se aceptaba cualquier
 * salto: se podía pasar de `pendiente` a `completada` sin haber empezado, y el
 * historial dejaba de significar algo.
 *
 * ⚠️ ESTA TABLA ESTÁ ESPEJADA EN EL FRONT:
 * FrontQ-D · src/app/core/transiciones.ts
 *
 * El front la copia para apagar de antemano lo que acá se va a rechazar, en
 * lugar de dejar intentar el movimiento y mostrar un error después. Si cambiás
 * una fila de PERMITIDAS, cambiala también allá o la interfaz va a ofrecer
 * acciones que este archivo rechaza. Ya pasó: el front tenía
 * `completada: ['en-curso']` mientras acá era `[]`, así que mostraba un botón
 * de reabrir y dejaba arrastrar la tarjeta para que el servidor contestara que
 * no. Los tests de transiciones.spec.ts del front fijan la copia.
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
