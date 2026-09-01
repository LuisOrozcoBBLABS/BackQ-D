import { ExecutionContext } from '@nestjs/common';
import { LIMITE_CUENTA, LIMITE_IP_PUBLICA, LIMITE_PERSONA } from './throttling';

function pedido(datos: Record<string, unknown>): Record<string, any> {
  return { ip: '190.0.0.1', socket: { remoteAddress: '190.0.0.1' }, ...datos };
}

function contexto(req: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

/** Los trackers pueden ser async; se normaliza para poder afirmar sobre el valor. */
async function clave(
  limite: typeof LIMITE_PERSONA,
  req: Record<string, unknown>,
): Promise<string> {
  return limite.getTracker!(req, contexto(req));
}

describe('Política de límites de peticiones', () => {
  describe('persona: el presupuesto es de quien inició sesión, no de la oficina', () => {
    it('con sesión cuenta por usuario', async () => {
      await expect(clave(LIMITE_PERSONA, pedido({ user: { id: 'u-ana' } }))).resolves.toBe('u:u-ana');
    });

    it('DOS personas detrás de la MISMA IP no comparten cupo', async () => {
      // Este es el bug entero, en una sola aserción. Antes las dos claves eran
      // la IP y las quinientas personas de la oficina compartían 120/min.
      const ana = await clave(LIMITE_PERSONA, pedido({ ip: '190.0.0.1', user: { id: 'u-ana' } }));
      const beto = await clave(LIMITE_PERSONA, pedido({ ip: '190.0.0.1', user: { id: 'u-beto' } }));
      expect(ana).not.toBe(beto);
    });

    it('la MISMA persona desde dos direcciones SÍ comparte cupo', async () => {
      // Y esto también importa: el presupuesto sigue a la persona, no al lugar.
      const oficina = await clave(LIMITE_PERSONA, pedido({ ip: '190.0.0.1', user: { id: 'u-ana' } }));
      const casa = await clave(LIMITE_PERSONA, pedido({ ip: '181.9.9.9', user: { id: 'u-ana' } }));
      expect(oficina).toBe(casa);
    });

    it('sin sesión cae a la dirección, que es la única identidad disponible', async () => {
      await expect(clave(LIMITE_PERSONA, pedido({}))).resolves.toBe('ip:190.0.0.1');
    });
  });

  describe('cuenta: la fuerza bruta se cuenta por correo', () => {
    it('cuenta por correo, no por dirección', async () => {
      await expect(
        clave(LIMITE_CUENTA, pedido({ body: { email: 'ana@bblabs.io' } })),
      ).resolves.toBe('cuenta:ana@bblabs.io');
    });

    it('normaliza mayúsculas y espacios, para que no sean cupos distintos', async () => {
      const a = await clave(LIMITE_CUENTA, pedido({ body: { email: '  Ana@BBLabs.io ' } }));
      const b = await clave(LIMITE_CUENTA, pedido({ body: { email: 'ana@bblabs.io' } }));
      expect(a).toBe(b);
    });

    it('DOS cuentas desde la misma dirección no se consumen los intentos', async () => {
      // Antes, cinco personas equivocándose de contraseña dejaban sin login a
      // las otras cuatrocientas noventa y cinco de la oficina.
      const ana = await clave(LIMITE_CUENTA, pedido({ body: { email: 'ana@bblabs.io' } }));
      const beto = await clave(LIMITE_CUENTA, pedido({ body: { email: 'beto@bblabs.io' } }));
      expect(ana).not.toBe(beto);
    });

    it('se salta en las rutas que no llevan correo', () => {
      expect(LIMITE_CUENTA.skipIf!(contexto(pedido({})))).toBe(true);
      expect(LIMITE_CUENTA.skipIf!(contexto(pedido({ body: {} })))).toBe(true);
      expect(LIMITE_CUENTA.skipIf!(contexto(pedido({ body: { email: '   ' } })))).toBe(true);
      expect(LIMITE_CUENTA.skipIf!(contexto(pedido({ body: { email: 123 } })))).toBe(true);
    });

    it('NO se salta cuando sí hay correo', () => {
      expect(LIMITE_CUENTA.skipIf!(contexto(pedido({ body: { email: 'ana@bblabs.io' } })))).toBe(false);
    });
  });

  describe('ip-publica: tapa el agujero que abre contar por cuenta', () => {
    it('aplica sin sesión', () => {
      // Sin esto, un atacante manda un correo distinto en cada intento y cada uno
      // estrena su propio cupo de cinco.
      expect(LIMITE_IP_PUBLICA.skipIf!(contexto(pedido({ body: { email: 'x@y.z' } })))).toBe(false);
    });

    it('NO aplica cuando hay sesión, y eso es el corazón del arreglo', () => {
      // Sobre tráfico autenticado una IP no identifica a nadie: la oficina entera
      // es una sola. Si este límite siguiera aplicando, el bug volvería por
      // atrás — quinientas personas compartiendo treinta peticiones por minuto.
      expect(LIMITE_IP_PUBLICA.skipIf!(contexto(pedido({ user: { id: 'u-ana' } })))).toBe(true);
    });

    it('cuenta por dirección', async () => {
      await expect(
        clave(LIMITE_IP_PUBLICA, pedido({ body: { email: 'x@y.z' } })),
      ).resolves.toBe('ip:190.0.0.1');
    });

    it('NO alcanza a /auth/refresh, que es pública y no lleva correo', () => {
      // Esta es la regresión que casi entra: refresh es pública, así que no tiene
      // sesión, y sin la condición del correo quedaba limitada a 30/min por IP.
      // Con quinientas personas renovando token cada quince minutos son ~33/min
      // desde la IP de la oficina — 429, y la sesión se les cae a todos. El mismo
      // bug que este archivo arregla, entrando por atrás.
      const refresh = contexto(pedido({ body: { refreshToken: 'a'.repeat(40) } }));
      expect(LIMITE_IP_PUBLICA.skipIf!(refresh)).toBe(true);
    });

    it('tampoco alcanza a las rutas públicas sin cuerpo, como el health check', () => {
      expect(LIMITE_IP_PUBLICA.skipIf!(contexto(pedido({})))).toBe(true);
    });
  });

  describe('los tres límites no se pisan entre sí', () => {
    it('cada uno tiene nombre propio, que es lo que los mantiene en cubos separados', () => {
      const nombres = [LIMITE_PERSONA.name, LIMITE_CUENTA.name, LIMITE_IP_PUBLICA.name];
      expect(new Set(nombres).size).toBe(3);
      expect(nombres.every(Boolean)).toBe(true);
    });

    it('un login sin sesión activa cuenta y ip-publica, y ninguno con sesión', () => {
      const login = contexto(pedido({ body: { email: 'ana@bblabs.io' } }));
      expect(LIMITE_CUENTA.skipIf!(login)).toBe(false);
      expect(LIMITE_IP_PUBLICA.skipIf!(login)).toBe(false);

      const conSesion = contexto(pedido({ user: { id: 'u-ana' } }));
      expect(LIMITE_CUENTA.skipIf!(conSesion)).toBe(true);
      expect(LIMITE_IP_PUBLICA.skipIf!(conSesion)).toBe(true);
    });
  });
});
