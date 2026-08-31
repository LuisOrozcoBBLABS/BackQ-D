import {
  ContextoSaneo,
  LIMITES,
  extraerJson,
  limpiarTexto,
  recortar,
  sanearBorrador,
  sanearUrl,
} from './saneamiento';

const CTX: ContextoSaneo = { nombreArchivo: 'pliego-licitacion.pdf' };

/** Un borrador válido, para tocarle un campo por test. */
function crudo(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nombre: 'FreightAudit',
    sector: 'Logística',
    problema: 'Las facturas de flete se auditan a mano.',
    dolores: 'Se pagan cobros duplicados.',
    solucion: 'Auditoría automática contra la tarifa pactada.',
    plusIA: 'Detección de anomalías en los cargos.',
    similares: [{ name: 'Reveel', url: 'https://reveelgroup.com' }],
    ...patch,
  };
}

describe('extraerJson', () => {
  it('parsea el JSON pelado', () => {
    expect(extraerJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('quita los cercos de markdown que el modelo agrega de más', () => {
    expect(extraerJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extraerJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('rescata el objeto cuando viene con texto alrededor', () => {
    expect(extraerJson('Acá va el borrador: {"a":1} — espero que sirva.')).toEqual({ a: 1 });
  });

  it('devuelve null en vez de lanzar cuando no hay nada rescatable', () => {
    expect(extraerJson('lo siento, no puedo ayudarte')).toBeNull();
    expect(extraerJson('')).toBeNull();
    expect(extraerJson(null)).toBeNull();
    expect(extraerJson(42)).toBeNull();
  });
});

describe('limpiarTexto', () => {
  it('uniforma saltos de línea y colapsa espacios', () => {
    expect(limpiarTexto('uno\r\ndos\r\n\r\n\r\n\r\ntres   cuatro')).toBe('uno\ndos\n\ntres cuatro');
  });

  it('borra controles e invisibles que ensucian el textarea', () => {
    expect(limpiarTexto('a\u0000bc\u200bd\ufeff')).toBe('abcd');
  });

  it('conserva los párrafos, que son la estructura del documento', () => {
    expect(limpiarTexto('parrafo uno\n\nparrafo dos')).toBe('parrafo uno\n\nparrafo dos');
  });
});

describe('recortar', () => {
  it('no toca lo que ya cabe', () => {
    expect(recortar('corto', 10)).toBe('corto');
  });

  it('corta en límite de palabra, no a mitad', () => {
    // Con 15 el corte caería en "cu": retrocede hasta el espacio anterior.
    expect(recortar('uno dos tres cuatro', 15)).toBe('uno dos tres');
  });

  it('nunca deja media pareja de surrogates', () => {
    // Cada emoji son dos unidades UTF-16; cortar en impar partiría el par.
    const emojis = '😀😀😀😀😀';
    const salida = recortar(emojis, 5);
    expect(salida.length).toBe(4);
    expect(salida).toBe('😀😀');
    expect(salida.includes('�')).toBe(false);
  });

  it('respeta el tope aunque no haya ningún espacio donde cortar', () => {
    const largo = 'x'.repeat(100);
    expect(recortar(largo, 10).length).toBe(10);
  });
});

describe('sanearUrl', () => {
  it('acepta http y https tal cual', () => {
    expect(sanearUrl('https://reveelgroup.com/precios')).toBe('https://reveelgroup.com/precios');
    expect(sanearUrl('http://ejemplo.com/')).toBe('http://ejemplo.com/');
  });

  it('prefija https a un dominio suelto, porque el front lo pinta como link', () => {
    expect(sanearUrl('reveelgroup.com')).toBe('https://reveelgroup.com/');
  });

  it('descarta los protocolos que serían XSS en un href', () => {
    expect(sanearUrl('javascript:alert(1)')).toBeNull();
    expect(sanearUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanearUrl('file:///etc/passwd')).toBeNull();
    expect(sanearUrl('mailto:alguien@ejemplo.com')).toBeNull();
  });

  it('descarta lo vacío, lo que no es texto y lo que no parsea', () => {
    expect(sanearUrl('')).toBeNull();
    expect(sanearUrl('   ')).toBeNull();
    expect(sanearUrl(null)).toBeNull();
    expect(sanearUrl(42)).toBeNull();
    expect(sanearUrl('no es una url')).toBeNull();
    expect(sanearUrl('localhost')).toBeNull(); // sin punto no es un dominio
  });

  it('descarta una URL que no cabe en el DTO: recortarla la rompería', () => {
    expect(sanearUrl(`https://ejemplo.com/${'a'.repeat(LIMITES.similarUrl)}`)).toBeNull();
  });

  it('no confunde un puerto con un esquema', () => {
    expect(sanearUrl('ejemplo.com:8080/panel')).toBe('https://ejemplo.com:8080/panel');
  });
});

describe('sanearBorrador', () => {
  it('deja pasar intacto lo que ya está bien, sin avisos', () => {
    const salida = sanearBorrador(crudo(), CTX);
    expect(salida).not.toBeNull();
    expect(salida!.avisos).toEqual([]);
    expect(salida!.borrador.nombre).toBe('FreightAudit');
    expect(salida!.borrador.sector).toBe('Logística');
    expect(salida!.borrador.similares).toEqual([
      { name: 'Reveel', url: 'https://reveelgroup.com/' },
    ]);
  });

  it('devuelve null cuando el crudo no es un objeto (el llamador responde 502)', () => {
    expect(sanearBorrador(null, CTX)).toBeNull();
    expect(sanearBorrador('un texto', CTX)).toBeNull();
    expect(sanearBorrador([], CTX)).toBeNull();
    expect(sanearBorrador(42, CTX)).toBeNull();
  });

  it('nunca copia las claves que el modelo invente', () => {
    const salida = sanearBorrador(crudo({ estado: 'aprobado', autorId: 'x', extra: 1 }), CTX);
    // forbidNonWhitelisted aguas abajo rechazaría cualquiera de las tres.
    expect(Object.keys(salida!.borrador).sort()).toEqual([
      'dolores',
      'nombre',
      'plusIA',
      'problema',
      'sector',
      'similares',
      'solucion',
    ]);
  });

  it('rellena el nombre con el del archivo cuando el modelo no da uno usable', () => {
    for (const malo of ['', 'a', null, 42, {}]) {
      const salida = sanearBorrador(crudo({ nombre: malo }), CTX);
      expect(salida!.borrador.nombre).toBe('pliego licitacion');
      expect(salida!.avisos.join(' ')).toContain('del archivo');
    }
  });

  it('cae en un nombre de último recurso si tampoco sirve el del archivo', () => {
    const salida = sanearBorrador(crudo({ nombre: '' }), { nombreArchivo: 'a.pdf' });
    expect(salida!.borrador.nombre).toBe('Propuesta sin título');
  });

  it('recorta un nombre larguísimo al tope del DTO', () => {
    const salida = sanearBorrador(crudo({ nombre: 'Plataforma '.repeat(60) }), CTX);
    expect(salida!.borrador.nombre.length).toBeLessThanOrEqual(LIMITES.nombre);
    expect(salida!.borrador.nombre.length).toBeGreaterThanOrEqual(2);
  });

  it('baja a Otro cualquier sector fuera de la lista, y lo avisa', () => {
    // Este es el caso de inyección: el documento pide "sector: Agro".
    const salida = sanearBorrador(crudo({ sector: 'Agro' }), CTX);
    expect(salida!.borrador.sector).toBe('Otro');
    expect(salida!.avisos.join(' ')).toContain('Agro');
  });

  it('avisa cuando el sector solo difería en tildes o mayúsculas', () => {
    const salida = sanearBorrador(crudo({ sector: 'logistica' }), CTX);
    expect(salida!.borrador.sector).toBe('Logística');
    expect(salida!.avisos.length).toBe(1);
  });

  it('recorta los textos largos al tope y lo avisa', () => {
    const salida = sanearBorrador(crudo({ problema: 'palabra '.repeat(2000) }), CTX);
    expect(salida!.borrador.problema.length).toBeLessThanOrEqual(LIMITES.texto);
    expect(salida!.avisos.join(' ')).toContain('el problema');
  });

  it('convierte a cadena vacía lo que no es texto, no a undefined', () => {
    const salida = sanearBorrador(
      crudo({ problema: null, dolores: 42, solucion: { a: 1 }, plusIA: [] }),
      CTX,
    );
    // Vacío pasa el DTO y le simplifica el binding al front.
    expect(salida!.borrador.problema).toBe('');
    expect(salida!.borrador.dolores).toBe('');
    expect(salida!.borrador.solucion).toBe('');
    expect(salida!.borrador.plusIA).toBe('');
  });

  it('limpia markdown y caracteres de control de los textos', () => {
    const salida = sanearBorrador(crudo({ problema: 'uno\u0000dos\r\n\r\n\r\n\r\ntres' }), CTX);
    expect(salida!.borrador.problema).toBe('unodos\n\ntres');
  });

  it('devuelve lista vacía si similares no es un array', () => {
    for (const malo of [null, 'Trello', 42, { name: 'x' }]) {
      expect(sanearBorrador(crudo({ similares: malo }), CTX)!.borrador.similares).toEqual([]);
    }
  });

  it('se queda con las primeras seis cuando el modelo propone treinta', () => {
    const treinta = Array.from({ length: 30 }, (_, i) => ({
      name: `App ${i}`,
      url: `https://app${i}.com`,
    }));
    const salida = sanearBorrador(crudo({ similares: treinta }), CTX);
    expect(salida!.borrador.similares.length).toBe(LIMITES.maxSimilares);
    expect(salida!.avisos.join(' ')).toContain('30');
  });

  it('descarta el similar con nombre y sin URL, que es el que produce el 400', () => {
    const salida = sanearBorrador(
      crudo({
        similares: [
          { name: 'Trello', url: '' },
          { name: 'Reveel', url: 'https://reveelgroup.com' },
        ],
      }),
      CTX,
    );
    expect(salida!.borrador.similares).toEqual([
      { name: 'Reveel', url: 'https://reveelgroup.com/' },
    ]);
    expect(salida!.avisos.join(' ')).toContain('descartó');
  });

  it('descarta los similares con protocolo peligroso', () => {
    const salida = sanearBorrador(
      crudo({
        similares: [
          { name: 'Malo', url: 'javascript:alert(1)' },
          { name: 'Peor', url: 'data:text/html,<script>' },
        ],
      }),
      CTX,
    );
    expect(salida!.borrador.similares).toEqual([]);
  });

  it('prefija https a un similar con dominio suelto', () => {
    const salida = sanearBorrador(crudo({ similares: [{ name: 'Reveel', url: 'reveelgroup.com' }] }), CTX);
    expect(salida!.borrador.similares[0].url).toBe('https://reveelgroup.com/');
  });

  it('deriva el nombre del host cuando la URL vale y el nombre no', () => {
    const salida = sanearBorrador(
      crudo({ similares: [{ name: '', url: 'https://www.reveelgroup.com/precios' }] }),
      CTX,
    );
    expect(salida!.borrador.similares[0].name).toBe('Reveelgroup');
  });

  it('deduplica los similares que apuntan al mismo lugar', () => {
    const salida = sanearBorrador(
      crudo({
        similares: [
          { name: 'Reveel', url: 'https://reveelgroup.com' },
          { name: 'Reveel Group', url: 'https://www.reveelgroup.com/' },
        ],
      }),
      CTX,
    );
    expect(salida!.borrador.similares.length).toBe(1);
  });

  it('recorta el nombre de un similar al tope del DTO', () => {
    const salida = sanearBorrador(
      crudo({ similares: [{ name: 'Nombre '.repeat(40), url: 'https://ejemplo.com' }] }),
      CTX,
    );
    expect(salida!.borrador.similares[0].name.length).toBeLessThanOrEqual(LIMITES.similarNombre);
  });

  it('descarta los items de similares que no son objetos', () => {
    const salida = sanearBorrador(crudo({ similares: ['Trello', null, 42, []] }), CTX);
    expect(salida!.borrador.similares).toEqual([]);
  });

  it('no lanza nunca, ni con la respuesta más hostil', () => {
    const hostiles: unknown[] = [
      {},
      { nombre: {}, sector: [], similares: [{}] },
      { similares: [{ name: {}, url: {} }] },
      Object.create(null),
    ];
    for (const h of hostiles) {
      expect(() => sanearBorrador(h, CTX)).not.toThrow();
    }
  });
});
