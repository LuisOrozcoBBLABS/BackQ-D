import { Injectable, Logger, Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { BorradoresService } from './borradores.service';
import { GeminiService } from './gemini.service';
import { PROVEEDOR_IA, PeticionIA, ProveedorIA, RespuestaIA } from './proveedor';

/**
 * El interruptor de apagado: con AI_PROVIDER=ninguno el endpoint responde 503 y
 * no sale ni un byte de la organización, sin desplegar código.
 *
 * Existe porque el texto de los documentos viaja a un tercero, y habilitar eso
 * en producción requiere el aval de quien sea dueño del gobierno de datos.
 * Poder apagarlo con una variable es la diferencia entre revertir una decisión
 * en un minuto y esperar un despliegue.
 */
@Injectable()
class ProveedorNulo implements ProveedorIA {
  readonly nombre = 'ninguno';
  readonly configurado = false;
  readonly modelo = 'ninguno';

  generarJson(_p: PeticionIA): Promise<RespuestaIA> {
    return Promise.resolve({
      ok: false,
      motivo: 'El motor de IA está apagado en este servidor.',
      reintentable: false,
    });
  }
}

/**
 * Primera useFactory del repo (hasta hoy solo había APP_GUARD). Sumar OpenAI
 * mañana es un archivo nuevo que implementa ProveedorIA, una rama más acá y dos
 * variables de entorno: BorradoresService no conoce a ningún proveedor concreto.
 */
@Module({
  controllers: [AiController],
  providers: [
    GeminiService,
    ProveedorNulo,
    {
      provide: PROVEEDOR_IA,
      inject: [GeminiService, ProveedorNulo],
      useFactory: (gemini: GeminiService, nulo: ProveedorNulo): ProveedorIA => {
        const logger = new Logger('AiModule');
        const elegido = (process.env.AI_PROVIDER ?? 'gemini').trim().toLowerCase();

        if (elegido !== 'gemini') {
          logger.warn(
            `Motor de IA apagado (AI_PROVIDER="${elegido}"). /ai/borrador-proyecto responde 503.`,
          );
          return nulo;
        }
        if (!gemini.configurado) {
          // Aviso una sola vez al arrancar, como hace MailService: es un
          // problema de configuración, no algo que reportar en cada request.
          logger.warn('Motor de IA sin GEMINI_API_KEY: /ai/borrador-proyecto responde 503.');
        }
        return gemini;
      },
    },
    BorradoresService,
  ],
})
export class AiModule {}
