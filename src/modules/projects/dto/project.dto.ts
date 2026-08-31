import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SimilarDto {
  @ApiProperty({ example: 'Reveel' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'https://reveelgroup.com' })
  @IsUrl({}, { message: 'La URL de la app parecida no es válida.' })
  @MaxLength(400)
  url!: string;
}

export class CreateProjectDto {
  @ApiProperty({ example: 'FreightAudit' })
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  nombre!: string;

  @ApiProperty({ example: 'Logística' })
  @IsString()
  @MaxLength(80)
  sector!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  problema?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  dolores?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  solucion?: string;

  @ApiPropertyOptional({ description: 'El PLUS con IA.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  plusIA?: string;

  @ApiPropertyOptional({ type: [SimilarDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimilarDto)
  similares?: SimilarDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  estado?: ProjectStatus;
}

export class UpdateProjectDto extends CreateProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  declare nombre: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  declare sector: string;
}

/** Resultados del motor de IA. En la fase 2 los va a producir el backend. */
export class SaveAiResultDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enriquecido?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  enrichment?: Record<string, unknown>;
}

/**
 * Solo la etapa. Va aparte de `UpdateProjectDto` porque su permiso es distinto:
 * mover una tarjeta del tablero lo puede hacer quien tiene el trabajo a cargo,
 * editar el contenido del proyecto no.
 */
export class CambiarEstadoDto {
  @ApiProperty({ enum: ProjectStatus })
  @IsEnum(ProjectStatus)
  estado!: ProjectStatus;
}
