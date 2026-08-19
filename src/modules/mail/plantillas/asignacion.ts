import { Prioridad } from '@prisma/client';

export interface DatosAsignacion {
  nombrePersona: string;
  nombreProyecto: string;
  sector: string;
  prioridad: Prioridad;
  nota: string;
  fechaLimite: Date | null;
  asignadoPor: string;
  urlAsignacion: string;
}

/* Paleta del manual de marca. En correo va en hexadecimal literal: los clientes
   de correo no soportan variables CSS ni hojas externas, todo va en línea. */
const OBSIDIAN = '#0B0A07';
const LIME = '#B2EA36';
const GRIS_TEXTO = '#54524D';
const GRIS_LINEA = '#E6E6E6';

const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = {
  urgente: 'Urgente',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fechaLarga(d: Date): string {
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function asuntoAsignacion(datos: DatosAsignacion): string {
  const marca = datos.prioridad === 'urgente' ? '[Urgente] ' : '';
  return `${marca}Te asignaron “${datos.nombreProyecto}”`;
}

/**
 * Correo de asignación. Tabla de un solo bloque y estilos en línea, que es lo
 * único que Outlook renderiza igual en escritorio, web y móvil.
 */
export function htmlAsignacion(d: DatosAsignacion): string {
  const filas: string[] = [
    fila('Sector', escapar(d.sector)),
    fila('Prioridad', ETIQUETA_PRIORIDAD[d.prioridad]),
    fila('Asignado por', escapar(d.asignadoPor)),
  ];
  if (d.fechaLimite) filas.push(fila('Fecha límite', fechaLarga(d.fechaLimite)));

  const nota = d.nota.trim()
    ? `<tr><td style="padding:18px 28px 0;">
         <p style="margin:0 0 6px;font:600 11px/1.4 Montserrat,'Segoe UI',Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8A8880;">Nota</p>
         <p style="margin:0;font:500 15px/1.6 Montserrat,'Segoe UI',Arial,sans-serif;color:${OBSIDIAN};">${escapar(d.nota)}</p>
       </td></tr>`
    : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(asuntoAsignacion(d))}</title></head>
<body style="margin:0;padding:0;background:#F1F1EF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F1EF;padding:28px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${GRIS_LINEA};border-radius:16px;overflow:hidden;">

    <tr><td style="background:${OBSIDIAN};padding:22px 28px;">
      <p style="margin:0;font:700 16px/1.2 Montserrat,'Segoe UI',Arial,sans-serif;color:#FFFFFF;letter-spacing:-.01em;">
        BLACKBIRD<span style="font-weight:500;">LABS</span>
      </p>
      <p style="margin:6px 0 0;font:600 10px/1.4 Montserrat,'Segoe UI',Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:${LIME};">
        Plataforma I+D
      </p>
    </td></tr>

    <tr><td style="padding:28px 28px 0;">
      <p style="margin:0;font:500 15px/1.6 Montserrat,'Segoe UI',Arial,sans-serif;color:${GRIS_TEXTO};">
        Hola ${escapar(d.nombrePersona)},
      </p>
      <h1 style="margin:10px 0 0;font:700 24px/1.25 Montserrat,'Segoe UI',Arial,sans-serif;color:${OBSIDIAN};letter-spacing:-.02em;">
        Te asignaron ${escapar(d.nombreProyecto)}
      </h1>
    </td></tr>

    <tr><td style="padding:22px 28px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid ${GRIS_LINEA};border-radius:12px;">
        ${filas.join('')}
      </table>
    </td></tr>

    ${nota}

    <tr><td style="padding:26px 28px 30px;">
      <a href="${d.urlAsignacion}"
         style="display:inline-block;background:${LIME};color:${OBSIDIAN};text-decoration:none;
                font:700 14px/1 Montserrat,'Segoe UI',Arial,sans-serif;padding:14px 24px;border-radius:999px;">
        Ver la asignación
      </a>
    </td></tr>

    <tr><td style="border-top:1px solid ${GRIS_LINEA};padding:16px 28px;">
      <p style="margin:0;font:500 11px/1.5 Montserrat,'Segoe UI',Arial,sans-serif;color:#8A8880;">
        Este aviso lo envía la Plataforma I+D del área de Innovación y Desarrollo. No hace falta responder.
      </p>
    </td></tr>

  </table>
</td></tr></table>
</body></html>`;
}

function fila(etiqueta: string, valor: string): string {
  return `<tr>
    <td style="padding:11px 16px;border-bottom:1px solid ${GRIS_LINEA};font:600 11px/1.4 Montserrat,'Segoe UI',Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8A8880;width:42%;">${etiqueta}</td>
    <td style="padding:11px 16px;border-bottom:1px solid ${GRIS_LINEA};font:500 14px/1.4 Montserrat,'Segoe UI',Arial,sans-serif;color:${OBSIDIAN};">${valor}</td>
  </tr>`;
}
