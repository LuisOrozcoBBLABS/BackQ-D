import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Géneros del contrato del front (con guiones). */
export const GENEROS_API = ['hombre', 'mujer', 'prefiero-no-decirlo'] as const;
export type GeneroApi = (typeof GENEROS_API)[number];

/**
 * Lo que cada persona puede editar de SU perfil. El cargo no está acá a propósito:
 * lo define un admin.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({}, { message: 'El LinkedIn debe ser una URL válida.' })
  @MaxLength(300)
  linkedin?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '+57 3001234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string | null;

  @ApiPropertyOptional({ enum: GENEROS_API, nullable: true })
  @IsOptional()
  @IsIn(GENEROS_API as unknown as string[])
  genero?: GeneroApi | null;

  @ApiPropertyOptional({ nullable: true, example: '1998-04-12' })
  @IsOptional()
  @IsDateString({}, { message: 'Fecha inválida (formato AAAA-MM-DD).' })
  fechaNacimiento?: string | null;

  /**
   * Foto en data URI o URL. Tope de 400 KB: en la versión con localStorage una
   * foto grande llenaba la cuota y los datos se perdían en silencio.
   */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(400000, { message: 'La foto supera los 400 KB. Recórtala o súbela más pequeña.' })
  avatarUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onboardingCompleto?: boolean;
}
