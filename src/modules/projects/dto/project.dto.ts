import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus, TipoEvidencia, TipoPrestacion } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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

/**
 * Una evidencia del proyecto: una captura, una demo o el despliegue. Siempre es
 * un enlace externo — aca no se sube ningun archivo.
 *
 * La allowlist de protocolo es explicita y no el `@IsUrl()` pelado: el default
 * de class-validator tambien acepta `ftp://`, y esta URL termina pintada en un
 * `href` de la ficha. Mismo criterio que `sanearUrl()` del modulo de IA.
 */
export class EvidenciaDto {
  @ApiProperty({ enum: TipoEvidencia, example: TipoEvidencia.despliegue })
  @IsEnum(TipoEvidencia)
  tipo!: TipoEvidencia;

  @ApiProperty({ example: 'Demo del tablero' })
  @IsString()
  @MaxLength(120)
  titulo!: string;

  @ApiProperty({ example: 'https://ejemplo.com/demo' })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'La URL de la evidencia no es válida.' },
  )
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

  /**
   * Cliente para el que se hace el proyecto.
   *
   * Opcional, no obligatorio: hay ideas internas que no tienen cliente, y
   * exigirlo dejaria sin poder editar todo lo que ya esta cargado sin este dato.
   * El tope de 140 es el mismo que el del nombre — es un nombre de empresa, no
   * un texto libre.
   *
   * OJO con la diferencia respecto de `tipoPrestacion`, que esta justo abajo:
   * el cliente vacio se guarda como NULL (una cadena en blanco y "sin cliente"
   * son el mismo hecho), mientras que `tipoPrestacion` distingue null de
   * ausente. No es una inconsistencia: en el cliente los dos valores vacios
   * significan lo mismo, en el tipo de prestacion el null es una eleccion.
   */
  @ApiPropertyOptional({ example: 'Retycol', description: 'Cliente para el que se hace el proyecto.' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  cliente?: string;

  /**
   * Que se presta: gente o producto. `null` es un valor con significado —"sin
   * clasificar"— y no un campo ausente, asi que un PATCH puede mandarlo para
   * devolver un proyecto a ese estado. `@IsOptional` deja pasar null ademas de
   * undefined, y el servicio distingue los dos casos con `!== undefined`.
   */
  @ApiPropertyOptional({ enum: TipoPrestacion, nullable: true })
  @IsOptional()
  @IsEnum(TipoPrestacion)
  tipoPrestacion?: TipoPrestacion | null;

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

  /** El tope existe aca y no solo en el front: el front es una sugerencia. */
  @ApiPropertyOptional({ type: [EvidenciaDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: 'No se pueden cargar más de 12 evidencias.' })
  @ValidateNested({ each: true })
  @Type(() => EvidenciaDto)
  evidencias?: EvidenciaDto[];

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
