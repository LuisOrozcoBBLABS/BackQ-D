import { ExecutionContext } from '@nestjs/common';
import { ThrottlerOptions } from '@nestjs/throttler';

/**
 * Política de límites de peticiones.
 *
 * ANTES: un solo límite de 120/min contado POR IP. Eso funciona con catorce
 * personas repartidas y se rompe el día que la empresa crece, porque una oficina
 * detrás de NAT es UNA sola IP: quinientas personas compartían 120 peticiones
 * por minuto, y el login compartía CINCO. El lunes a las 8 no entraba nadie.
 *
 * Y el número engaña más de lo que parece: un render del tablero dispara once
 * peticiones, una por etapa del pipeline. Once personas abriendo el tablero en
 * el mismo minuto agotaban la cuota de toda la empresa.
 *
 * AHORA son tres límites con nombre, porque son tres preguntas distintas:
 *
 *   persona     ¿hay alguien golpeando la API? — cuenta por usuario
 *   cuenta      ¿le están probando contraseñas a alguien? — cuenta por correo
 *   ip-publica  ¿hay una dirección barriendo muchas cuentas? — cuenta por IP
 *
 * Un límite por IP sobre tráfico AUTENTICADO no distingue a un atacante de una
 * oficina: son la misma dirección. Por eso `ip-publica` se salta cuando hay
 * sesión — ahí la identidad es la persona, y esa sí distingue.
 *
 * ⚠️ EL ALMACENAMIENTO ES EN MEMORIA DEL PROCESO.
 * Con una sola instancia funciona. Con dos réplicas cada una lleva su propia
 * cuenta y el límite real se multiplica por la cantidad de réplicas; además se
 * reinicia con cada despliegue y con cada arranque en frío. Si esto pasa a más
 * de una instancia hay que mover el almacenamiento a Redis
 * (@nest-lab/throttler-storage-redis), que es una dependencia nueva y por eso no
 * se agregó acá.
 */

/** Dirección del cliente. `trust proxy` ya está activo, así que `req.ip` es la real. */
function ipDe(req: Record<string, any>): string {
  return (req.ip as string) ?? (req.socket?.remoteAddress as string) ?? 'desconocida';
}

/** El correo que viene en el cuerpo, normalizado. Null si la ruta no lleva uno. */
function correoDe(req: Record<string, any>): string | null {
  const email = req.body?.email;
  if (typeof email !== 'string') return null;
  const limpio = email.trim().toLowerCase();
  return limpio ? limpio : null;
}

/** Hay sesión válida. Cierto solo si el guard de autenticación ya corrió. */
function haySesion(ctx: ExecutionContext): boolean {
  return typeof ctx.switchToHttp().getRequest()?.user?.id === 'string';
}

/**
 * El límite por dirección aplica SOLO donde se pueden adivinar credenciales, o
 * sea donde la petición trae un correo: login y recuperación.
 *
 * La condición del correo no es un detalle, es lo que evita reintroducir el bug
 * por otra puerta. `POST /auth/refresh` es pública y NO lleva correo. Sin esta
 * condición quedaba limitada a 30/min por IP, y con quinientas personas
 * renovando su token cada quince minutos son unas treinta y tres renovaciones
 * por minuto desde la IP de la oficina: al rato empiezan los 429 y la sesión se
 * les cae a todos. El mismo problema que este archivo arregla, entrando por
 * atrás.
 *
 * Y limitar refresh por dirección tampoco tendría sentido: un refresh token no
 * se adivina, así que ahí no hay nada que frenar. Lo cubre LIMITE_PERSONA con su
 * respaldo por IP, que a 300/min tiene nueve veces el margen necesario.
 */
function noSeAdivinanCredenciales(ctx: ExecutionContext): boolean {
  return correoDe(ctx.switchToHttp().getRequest()) === null;
}

/**
 * Presupuesto por persona.
 *
 * 300/min no es un número redondo elegido al azar: el tablero pide once
 * peticiones por render, y alguien filtrando y navegando rápido puede encadenar
 * varias decenas por minuto sin ser un abuso. 300 deja lugar de sobra para uso
 * intenso y sigue cortando un bucle descontrolado.
 *
 * Sin sesión cae a la IP, que es la única identidad que hay en ese caso.
 */
export const LIMITE_PERSONA: ThrottlerOptions = {
  name: 'persona',
  ttl: 60_000,
  limit: 300,
  getTracker: req => {
    const id = req.user?.id;
    return typeof id === 'string' ? `u:${id}` : `ip:${ipDe(req)}`;
  },
};

/**
 * Freno a la fuerza bruta, contado POR CUENTA y no por IP.
 *
 * Esta es la corrección que más importa. Con el conteo por IP, las cinco
 * peticiones por minuto eran de toda la oficina: cinco personas equivocándose de
 * contraseña dejaban afuera a las otras cuatrocientas noventa y cinco. Contado
 * por cuenta, cada quien tiene sus cinco intentos y nadie le consume los suyos a
 * nadie.
 *
 * Se salta cuando la petición no trae correo, que son todas menos login y
 * recuperación.
 */
export const LIMITE_CUENTA: ThrottlerOptions = {
  name: 'cuenta',
  ttl: 60_000,
  limit: 5,
  skipIf: ctx => correoDe(ctx.switchToHttp().getRequest()) === null,
  getTracker: req => `cuenta:${correoDe(req)}`,
};

/**
 * Techo por dirección, solo sobre tráfico SIN sesión.
 *
 * Existe para tapar el agujero que abre `cuenta` al contar por correo: si el
 * único freno fuera por cuenta, un atacante mandaría un correo distinto en cada
 * intento y cada uno estrenaría su propio cupo de cinco. Con esto, una dirección
 * hace a lo sumo treinta intentos por minuto sin importar contra cuántas cuentas
 * los reparta.
 *
 * Se salta en dos casos, y los dos importan. Con sesión, porque sobre tráfico
 * autenticado una IP no dice quién es nadie — la oficina entera es una sola, y
 * ahí la identidad correcta es la persona. Y sin correo en el cuerpo, porque esa
 * es la marca de que no hay credenciales que adivinar: ver el comentario de
 * noSeAdivinanCredenciales, que explica cómo /auth/refresh reintroducía el bug
 * si este límite lo alcanzaba.
 */
export const LIMITE_IP_PUBLICA: ThrottlerOptions = {
  name: 'ip-publica',
  ttl: 60_000,
  limit: 30,
  skipIf: ctx => haySesion(ctx) || noSeAdivinanCredenciales(ctx),
  getTracker: req => `ip:${ipDe(req)}`,
};

export const LIMITES = [LIMITE_PERSONA, LIMITE_CUENTA, LIMITE_IP_PUBLICA];
