import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentStatus, Canal, Prioridad } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Estados tal como los escribe el front (con guion). */
export const ESTADOS_API = ['pendiente', 'aceptada', 'en-curso', 'completada'] as const;

export class CreateAssignmentDto {
  @ApiProperty()
  @IsUUID()
  projectId!: string;

  @ApiProperty({ description: 'A quién se le asigna.' })
  @IsUUID()
  asignadoAId!: string;

  @ApiProperty({ enum: Prioridad })
  @IsEnum(Prioridad)
  prioridad!: Prioridad;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  nota?: string;

  @ApiPropertyOptional({ example: '2026-09-30', nullable: true })
  @IsOptional()
  @IsDateString({}, { message: 'Fecha límite inválida (AAAA-MM-DD).' })
  fechaLimite?: string | null;

  @ApiProperty({ enum: Canal, isArray: true, example: ['correo'] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Elige al menos un canal de aviso.' })
  @IsEnum(Canal, { each: true })
  canales!: Canal[];
}

export type EstadoApi = (typeof ESTADOS_API)[number];

export class UpdateEstadoDto {
  /**
   * Llega con guion ('en-curso') porque asi lo usa el front. La conversion al
   * enum de Prisma se hace despues de validar: si se transformaba antes,
   * @IsIn rechazaba el valor ya convertido.
   */
  @ApiProperty({ enum: ESTADOS_API })
  @IsIn(ESTADOS_API as unknown as string[])
  estado!: EstadoApi;
}

/** 'en-curso' -> AssignmentStatus.en_curso */
export function aEstadoPrisma(estado: EstadoApi): AssignmentStatus {
  return estado.replace(/-/g, '_') as AssignmentStatus;
}

export class QueryAssignmentsDto {
  @ApiPropertyOptional({
    default: true,
    description: 'true = solo mías. false requiere el permiso assignments.create.',
  })
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  mias?: boolean;
}
