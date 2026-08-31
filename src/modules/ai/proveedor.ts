/**
 * El puerto del proveedor de IA.
 *
 * El contrato es deliberadamente angosto: "dame JSON que respete este esquema".
 * Es el nivel correcto porque es lo que saben hacer todos los proveedores, y
 * porque es todo lo que esta feature necesita. No abstrae mensajes, roles,
 * streaming ni tools: nada de eso se usa, y abstraerlo sería inventar una
 * interfaz para un caso que no existe.
 *
 * Sumar un segundo proveedor mañana = un archivo nuevo que implementa esta
 * interfaz, una rama en la factory de ai.module.ts y dos variables de entorno.
 * BorradoresService no conoce Gemini.
 */

/** Token de inyección. Es la primera useFactory del repo (hoy solo hay APP_GUARD). */
export const PROVEEDOR_IA = 'PROVEEDOR_IA';

/** Un JSON Schema, en la forma que entiende el proveedor. */
export type EsquemaJson = Record<string, unknown>;

export interface PeticionIA {
  instruccionSistema: string;
  prompt: string;
  esquema: EsquemaJson;
  maxTokensSalida?: number;
}

/**
 * Unión discriminada, igual que ResultadoEnvio de MailService: el proveedor
 * nunca lanza al llamador. `reintentable` distingue lo transitorio (saturación,
 * red, timeout) de lo definitivo (clave rechazada, modelo inexistente), para que
 * el orquestador no insista donde insistir no sirve.
 */
export type RespuestaIA =
  | { ok: true; texto: string; modelo: string; tokens?: number }
  | { ok: false; motivo: string; reintentable: boolean };

export interface ProveedorIA {
  readonly nombre: string;
  readonly configurado: boolean;
  readonly modelo: string;
  generarJson(p: PeticionIA): Promise<RespuestaIA>;
}
