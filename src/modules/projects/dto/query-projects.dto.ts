import { ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentStatus, Prioridad, ProjectStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class QueryProjectsDto {
  @ApiPropertyOptional({ description: 'Busca en nombre, problema y solución.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sector?: string;

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  estado?: ProjectStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  // ---------------- Filtros del tablero ----------------

  @ApiPropertyOptional({
    description:
      'Solo los proyectos asignados a quien pregunta. Es el alcance del tablero: ' +
      'lo que tiene a cargo, no lo que puede ver.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  asignadoAMi?: boolean;

  @ApiPropertyOptional({ description: 'Solo lo asignado por esta persona.' })
  @IsOptional()
  @IsUUID()
  asignadoPor?: string;

  @ApiPropertyOptional({ description: 'Solo lo asignado a esta persona (necesita ver el area).' })
  @IsOptional()
  @IsUUID()
  asignadoA?: string;

  @ApiPropertyOptional({ enum: Prioridad, description: 'Prioridad de la asignacion.' })
  @IsOptional()
  @IsEnum(Prioridad)
  prioridad?: Prioridad;

  @ApiPropertyOptional({ enum: AssignmentStatus, description: 'Estado de la asignacion.' })
  @IsOptional()
  @IsEnum(AssignmentStatus)
  estadoAsignacion?: AssignmentStatus;

  @ApiPropertyOptional({ description: 'Registrados desde esta fecha (inclusive), ISO.' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ description: 'Registrados hasta esta fecha (inclusive), ISO.' })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiPropertyOptional({ description: 'Solo los que tienen alguna asignacion con plazo vencido.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  vencidos?: boolean;

  @ApiPropertyOptional({ description: 'Solo los que no tienen a nadie asignado.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  sinAsignar?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Incluye los archivados.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  archivados?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
