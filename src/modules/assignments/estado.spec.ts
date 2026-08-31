import { AssignmentStatus } from '@prisma/client';
import { motivoTransicionInvalida, transicionValida } from './estado';

describe('transiciones de estado de una asignación', () => {
  it('avanza por el camino esperado', () => {
    expect(transicionValida(AssignmentStatus.pendiente, AssignmentStatus.aceptada)).toBe(true);
    expect(transicionValida(AssignmentStatus.aceptada, AssignmentStatus.en_curso)).toBe(true);
    expect(transicionValida(AssignmentStatus.en_curso, AssignmentStatus.completada)).toBe(true);
  });

  it('no deja saltarse pasos', () => {
    expect(transicionValida(AssignmentStatus.pendiente, AssignmentStatus.completada)).toBe(false);
    expect(transicionValida(AssignmentStatus.pendiente, AssignmentStatus.en_curso)).toBe(false);
  });

  it('permite volver atrás un paso desde cualquier estado', () => {
    expect(transicionValida(AssignmentStatus.en_curso, AssignmentStatus.aceptada)).toBe(true);
    expect(transicionValida(AssignmentStatus.aceptada, AssignmentStatus.pendiente)).toBe(true);
    // Reabrir lo completado: cerrar por error es comun y crear otra asignacion
    // para corregirlo rompia la trazabilidad.
    expect(transicionValida(AssignmentStatus.completada, AssignmentStatus.en_curso)).toBe(true);
  });

  it('reabrir no permite saltar mas atras que en curso', () => {
    expect(transicionValida(AssignmentStatus.completada, AssignmentStatus.aceptada)).toBe(false);
    expect(transicionValida(AssignmentStatus.completada, AssignmentStatus.pendiente)).toBe(false);
  });

  it('acepta reenviar el mismo estado sin tratarlo como error', () => {
    for (const estado of Object.values(AssignmentStatus)) {
      expect(transicionValida(estado, estado)).toBe(true);
    }
  });

  it('explica qué se puede hacer en lugar de solo negar', () => {
    expect(motivoTransicionInvalida(AssignmentStatus.pendiente, AssignmentStatus.completada)).toContain(
      'solo se puede ir a aceptada',
    );
    expect(motivoTransicionInvalida(AssignmentStatus.completada, AssignmentStatus.pendiente)).toContain(
      'solo se puede ir a en curso',
    );
  });
});
