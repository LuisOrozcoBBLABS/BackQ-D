import { Injectable, Logger } from '@nestjs/common';
import { PeticionIA, ProveedorIA, RespuestaIA } from './proveedor';

/**
 * Cliente de Google Gemini. Molde: modules/mail/mail.service.ts — Logger
 * privado, getter `configurado` leyendo process.env directo (en este repo nadie
 * inyecta ConfigService), unión discriminada de retorno que nunca lanza al
 * llamador, helper de módulo `mensaje()` al final, y fetch sin SDK.
 *
 * Se usa `generateContent` y no la Interactions API nueva a propósito: acá se
 * escribe un cliente con fetch crudo que parsea a mano, y generateContent tiene
 * forma de respuesta estable desde hace años, contra una API que rompió
 * compatibilidad en mayo de 2026. Está soportada sin fecha de retiro, y migrar
 * después es cambiar UN método de UN archivo — que es justamente el punto de
 * tener el puerto en proveedor.ts.
 *
 * ADVERTENCIA de privacidad: el texto que se manda acá sale de la organización
 * hacia Google. En la capa gratuita, sus términos permiten usar el contenido
 * para mejorar sus productos. El interruptor de apagado es AI_PROVIDER=ninguno.
 */

const URL_POR_DEFECTO = 'https://generativelanguage.googleapis.com/v1beta';
const MODELO_POR_DEFECTO = 'gemini-2.5-flash';
const TIMEOUT_POR_DEFECTO = 30_000;

interface ParteGemini {
  text?: string;
  /** Los modelos 2.5+ emiten partes de razonamiento. No son la respuesta. */
  thought?: boolean;
}

interface RespuestaGemini {
  candidates?: {
    content?: { parts?: ParteGemini[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { totalTokenCount?: number };
}

@Injectable()
export class GeminiService implements ProveedorIA {
  private readonly logger = new Logger(GeminiService.name);
  readonly nombre = 'gemini';

  get configurado(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  /** Configurable y nunca hardcodeado: la oferta de la capa gratuita cambia. */
  get modelo(): string {
    return process.env.GEMINI_MODEL || MODELO_POR_DEFECTO;
  }

  private get base(): string {
    return process.env.GEMINI_API_URL || URL_POR_DEFECTO;
  }

  private get timeoutMs(): number {
    const crudo = Number(process.env.AI_TIMEOUT_MS);
    return Number.isFinite(crudo) && crudo > 0 ? crudo : TIMEOUT_POR_DEFECTO;
  }

  async generarJson(p: PeticionIA): Promise<RespuestaIA> {
    if (!this.configurado) {
      return {
        ok: false,
        motivo: 'El motor de IA no está configurado en el servidor.',
        reintentable: false,
      };
    }

    const url = `${this.base}/models/${encodeURIComponent(this.modelo)}:generateContent`;
    const cuerpo = {
      systemInstruction: { parts: [{ text: p.instruccionSistema }] },
      contents: [{ role: 'user', parts: [{ text: p.prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: p.esquema,
        temperature: 0.2,
        candidateCount: 1,
        maxOutputTokens: p.maxTokensSalida ?? 2048,
      },
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          // La key va en header y NUNCA en ?key= de la query: una key en la URL
          // termina en logs de acceso, en proxies y en mensajes de error.
          'x-goog-api-key': process.env.GEMINI_API_KEY as string,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cuerpo),
        // Desvío deliberado de MailService: Graph responde o falla, pero un LLM
        // puede quedar colgado minutos con un request HTTP esperando detrás.
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
        return {
          ok: false,
          motivo: `El modelo tardó más de ${Math.round(this.timeoutMs / 1000)} segundos en responder.`,
          reintentable: true,
        };
      }
      return { ok: false, motivo: `Sin conexión con el modelo: ${mensaje(e)}`, reintentable: true };
    }

    if (!res.ok) return this.traducirError(res);

    let data: RespuestaGemini;
    try {
      // `null` es JSON válido, así que el try/catch no alcanza: hay que mirar
      // qué salió antes de tocarle una propiedad.
      const crudo: unknown = await res.json();
      if (!crudo || typeof crudo !== 'object') throw new Error('no es un objeto');
      data = crudo as RespuestaGemini;
    } catch {
      return { ok: false, motivo: 'El modelo devolvió una respuesta ilegible.', reintentable: true };
    }

    if (data.promptFeedback?.blockReason) {
      return {
        ok: false,
        motivo: 'El documento fue rechazado por los filtros de seguridad del modelo.',
        reintentable: false,
      };
    }

    const candidato = data.candidates?.[0];
    if (candidato?.finishReason === 'MAX_TOKENS') {
      return {
        ok: false,
        motivo: 'La respuesta del modelo quedó cortada. Probá con un documento más corto.',
        reintentable: false,
      };
    }

    // No asumir parts[0]: se concatenan las partes de texto y se filtran las de
    // razonamiento, que los modelos 2.5+ mezclan con la respuesta.
    const texto = (candidato?.content?.parts ?? [])
      .filter(parte => !parte.thought && typeof parte.text === 'string')
      .map(parte => parte.text as string)
      .join('');

    if (!texto.trim()) {
      return { ok: false, motivo: 'El modelo no devolvió contenido.', reintentable: false };
    }

    return {
      ok: true,
      texto,
      modelo: this.modelo,
      // Es un número: es seguro logearlo y sirve para vigilar la cuota.
      tokens: data.usageMetadata?.totalTokenCount,
    };
  }

  /**
   * Misma escalera que Graph, más dos capas que Graph no necesita.
   *
   * El truncado del body es más estricto que el .slice(0, 300) de MailService a
   * propósito: lo que le mandamos al proveedor es texto de documentos internos,
   * así que un body de error que lo eche podría meterlo al log. Nos quedamos
   * SOLO con code, status y message cuando parsea como JSON.
   */
  private async traducirError(res: Response): Promise<RespuestaIA> {
    const detalle = await this.detalleSeguro(res);

    if (res.status === 429 || res.status >= 500) {
      return {
        ok: false,
        motivo: 'El servicio de IA está saturado. Probá de nuevo en un minuto.',
        reintentable: true,
      };
    }

    if (res.status === 403 || res.status === 401) {
      this.logger.error(`La API de IA rechazó la clave (${res.status}): ${detalle}`);
      return { ok: false, motivo: 'La clave de la API de IA fue rechazada.', reintentable: false };
    }

    if (res.status === 404) {
      this.logger.error(`Modelo no encontrado (404): ${detalle}`);
      return {
        ok: false,
        motivo:
          'El modelo configurado en GEMINI_MODEL no existe o no está disponible para esta clave.',
        reintentable: false,
      };
    }

    this.logger.error(`La API de IA respondió ${res.status}: ${detalle}`);
    return {
      ok: false,
      motivo: `El servicio de IA respondió con un error (${res.status}).`,
      reintentable: false,
    };
  }

  /** Solo code, status y message. Si no parsea, un recorte corto y nada más. */
  private async detalleSeguro(res: Response): Promise<string> {
    const bruto = await res.text().catch(() => '');
    try {
      const json = JSON.parse(bruto) as { error?: { code?: number; status?: string; message?: string } };
      const e = json.error;
      if (e) return `${e.code ?? res.status} ${e.status ?? ''} ${(e.message ?? '').slice(0, 200)}`.trim();
    } catch {
      /* no era JSON */
    }
    return bruto.slice(0, 300);
  }
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
