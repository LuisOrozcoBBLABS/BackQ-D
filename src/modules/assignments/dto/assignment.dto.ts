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

export class UpdateEstadoDto {
  @ApiProperty({ enum: ESTADOS_API })
  @IsIn(ESTADOS_API as unknown as string[])
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/-/g, '_') : value))
  estado!: AssignmentStatus;
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
