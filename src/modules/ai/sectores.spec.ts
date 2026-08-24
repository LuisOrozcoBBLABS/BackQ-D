import { SECTORES, normalizarSector } from './sectores';

describe('sectores', () => {
  /**
   * Este test es el que sostiene la duplicación con el front. Los ocho literales
   * están escritos a mano acá para que, si alguien los cambia en
   * FrontQ-D/src/app/core/models.ts sin avisar, falle un test en vez de romperse
   * el <select> en producción.
   */
  it('mantiene los ocho literales exactamente como los espera el front', () => {
    expect(SECTORES).toEqual([
      'Logística',
      'Retail / E-commerce',
      'Finanzas',
      'Fintech',
      'Salud',
      'Educación',
      'Farma',
      'Otro',
    ]);
  });

  it('reconoce el valor exacto y lo marca como exacto', () => {
    for (const sector of SECTORES) {
      expect(normalizarSector(sector)).toEqual({ sector, exacto: true });
    }
  });

  it('normaliza mayúsculas y tildes sin dar por exacto', () => {
    expect(normalizarSector('logistica')).toEqual({ sector: 'Logística', exacto: false });
    expect(normalizarSector('EDUCACIÓN')).toEqual({ sector: 'Educación', exacto: false });
    expect(normalizarSector('  finanzas  ')).toEqual({ sector: 'Finanzas', exacto: false });
  });

  it('traduce los sinónimos que el modelo usa de verdad', () => {
    expect(normalizarSector('banca').sector).toBe('Finanzas');
    expect(normalizarSector('Seguros').sector).toBe('Finanzas');
    expect(normalizarSector('pharma').sector).toBe('Farma');
    expect(normalizarSector('EdTech').sector).toBe('Educación');
    expect(normalizarSector('transporte').sector).toBe('Logística');
    expect(normalizarSector('e-commerce').sector).toBe('Retail / E-commerce');
  });

  it('cae en Otro ante cualquier cosa que no reconoce', () => {
    // Incluye el caso de inyección: el documento pide un sector inventado.
    expect(normalizarSector('Agro').sector).toBe('Otro');
    expect(normalizarSector('').sector).toBe('Otro');
    expect(normalizarSector(null).sector).toBe('Otro');
    expect(normalizarSector(42).sector).toBe('Otro');
    expect(normalizarSector({ sector: 'Salud' }).sector).toBe('Otro');
  });
});
