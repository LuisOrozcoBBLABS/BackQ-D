import { ApiPropertyOptional } from '@nestjs/swagger';
import { RoleId } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryUsersDto {
  @ApiPropertyOptional({ description: 'Busca por nombre o correo.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @ApiPropertyOptional({ enum: RoleId })
  @IsOptional()
  @IsEnum(RoleId)
  rol?: RoleId;

  @ApiPropertyOptional({ enum: ['activos', 'inactivos', 'todos'], default: 'todos' })
  @IsOptional()
  @IsIn(['activos', 'inactivos', 'todos'])
  estado?: 'activos' | 'inactivos' | 'todos';

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
