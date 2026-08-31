import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequestUser } from '../../common/types/request-user';
import { ArchivoSubido, BorradoresService } from './borradores.service';
import { BorradorDesdeDocumentoDto } from './dto/borrador.dto';

/** 8 MB. Alineado con el tope que valida el front antes de subir. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Módulo propio y no dentro de ProjectsController a propósito: este endpoint no
 * persiste nada y no toca el recurso `projects`. El backend no guarda ni el
 * archivo ni el borrador — viaja en la respuesta y vive en el navegador hasta
 * que la persona lo guarda con POST /projects.
 */
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly borradores: BorradoresService) {}

  @Post('borrador-proyecto')
  @RequirePermission('ai.use')
  /**
   * 4 por minuto. Hay UNA sola key para todo el backend, así que el límite del
   * proveedor es compartido por todo el equipo, y ThrottlerGuard cuenta por IP,
   * no por usuario: no puede garantizar el techo global. Con 4/min y dos o tres
   * personas en paralelo quedamos debajo del orden de magnitud de la capa
   * gratuita, y una persona sola no le quema la cuota diaria al resto. El techo
   * real lo pone el 429 del proveedor, traducido a 503 con mensaje claro.
   */
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('archivo', {
      // `limits` completo, no solo fileSize: el repo no tiene ningún límite de
      // body configurado en ninguna parte, así que sin fields/parts este
      // endpoint sería el punto más expuesto de la API — un multipart con
      // 100.000 campos de texto es un DoS trivial contra la memoria del proceso.
      limits: { fileSize: MAX_BYTES, files: 1, fields: 2, parts: 4 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    // Esquema inline y no una clase: una clase con @ApiProperty({format:'binary'})
    // no le da a Swagger UI el selector de archivo de forma confiable.
    schema: {
      type: 'object',
      required: ['archivo'],
      properties: {
        archivo: { type: 'string', format: 'binary', description: 'PDF o DOCX, hasta 8 MB.' },
        contexto: { type: 'string', maxLength: 300, description: 'Pista opcional de qué es.' },
      },
    },
  })
  @ApiOperation({
    summary: 'Propone el borrador de un proyecto a partir de un PDF o DOCX.',
    description:
      'No persiste nada: ni el archivo ni el borrador se guardan. El archivo se procesa en ' +
      'memoria y se descarta.\n\n' +
      'El campo `borrador` de la respuesta es exactamente el body de POST /projects: mandalo ' +
      'con `{...respuesta.borrador}`. Los metadatos (`avisos`, `origen`, `modelo`) van como ' +
      'hermanos y NO deben incluirse en ese body, porque POST /projects valida con ' +
      'forbidNonWhitelisted y devolvería 400.\n\n' +
      'ADVERTENCIA: el texto extraído se envía a un proveedor externo de IA. Con ' +
      'AI_PROVIDER=ninguno o sin clave configurada, responde 503.',
  })
  desdeDocumento(
    @UploadedFile() archivo: ArchivoSubido | undefined,
    @Body() dto: BorradorDesdeDocumentoDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.borradores.desdeDocumento(archivo, dto, user);
  }
}
