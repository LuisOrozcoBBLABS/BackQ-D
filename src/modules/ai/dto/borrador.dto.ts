import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Los campos de TEXTO del multipart. El archivo va por @UploadedFile() y el
 * ValidationPipe no lo toca.
 *
 * La trampa que hay que conocer: multer deja los campos de texto en req.body, y
 * ahí el pipe global sí valida con `whitelist + forbidNonWhitelisted`. O sea que
 * cualquier campo de texto que no sea `contexto` hace que la request devuelva
 * 400, aunque el archivo esté perfecto. El campo del archivo se llama
 * exactamente `archivo`.
 */
export class BorradorDesdeDocumentoDto {
  @ApiPropertyOptional({
    description: 'Pista opcional sobre qué es el documento.',
    example: 'Es un pliego de licitación de transporte.',
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  contexto?: string;
}
