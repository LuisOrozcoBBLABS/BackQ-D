import { Injectable, Logger } from '@nestjs/common';

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export interface CorreoAEnviar {
  para: string;
  asunto: string;
  html: string;
}

export type ResultadoEnvio =
  | { ok: true }
  | { ok: false; motivo: string; reintentable: boolean };

/**
 * Envío de correo por Microsoft Graph con credenciales de aplicación
 * (client_credentials). No usa SDK: el flujo son dos llamadas HTTP, y así no
 * arrastramos msal + graph-client al proyecto.
 *
 * Requiere en el .env: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET y
 * MAIL_FROM (el buzón remitente, acotado por Application Access Policy).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private token: { valor: string; expiraEn: number } | null = null;
  private avisoFaltaConfig = false;

  /** Si falta configuración, el despachador deja los envíos en pendiente. */
  get configurado(): boolean {
    return Boolean(
      process.env.AZURE_TENANT_ID &&
        process.env.AZURE_CLIENT_ID &&
        process.env.AZURE_CLIENT_SECRET &&
        process.env.MAIL_FROM,
    );
  }

  /** Avisa una sola vez, para no ensuciar el log en cada tick del cron. */
  avisarFaltaConfiguracion(): void {
    if (this.avisoFaltaConfig) return;
    this.avisoFaltaConfig = true;
    this.logger.warn(
      'Correo sin configurar (faltan AZURE_* o MAIL_FROM). Los envíos quedan en pendiente hasta que se configure.',
    );
  }

  async enviar(correo: CorreoAEnviar): Promise<ResultadoEnvio> {
    let token: string;
    try {
      token = await this.obtenerToken();
    } catch (e) {
      // Fallo de credenciales: reintentar no ayuda hasta que alguien lo corrija.
      return { ok: false, motivo: mensaje(e), reintentable: false };
    }

    const remitente = encodeURIComponent(process.env.MAIL_FROM as string);
    const url = `https://graph.microsoft.com/v1.0/users/${remitente}/sendMail`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject: correo.asunto,
            body: { contentType: 'HTML', content: correo.html },
            toRecipients: [{ emailAddress: { address: correo.para } }],
          },
          saveToSentItems: true,
        }),
      });
    } catch (e) {
      // Red caída: sí vale la pena reintentar.
      return { ok: false, motivo: `Sin conexión con Graph: ${mensaje(e)}`, reintentable: true };
    }

    if (res.status === 202) return { ok: true };

    const detalle = (await res.text().catch(() => '')).slice(0, 300);

    // 429 y 5xx son transitorios; 4xx (permiso, buzón inexistente) no lo son.
    const reintentable = res.status === 429 || res.status >= 500;
    return { ok: false, motivo: `Graph respondió ${res.status}: ${detalle}`, reintentable };
  }

  /** Token de aplicación, cacheado hasta un minuto antes de expirar. */
  private async obtenerToken(): Promise<string> {
    const ahora = Date.now();
    if (this.token && this.token.expiraEn > ahora + 60_000) return this.token.valor;

    const url = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
    const cuerpo = new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID as string,
      client_secret: process.env.AZURE_CLIENT_SECRET as string,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo,
    });

    if (!res.ok) {
      const detalle = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`No se pudo obtener el token de Graph (${res.status}): ${detalle}`);
    }

    const data = (await res.json()) as TokenResponse;
    this.token = { valor: data.access_token, expiraEn: ahora + data.expires_in * 1000 };
    return this.token.valor;
  }
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
