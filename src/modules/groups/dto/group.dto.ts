import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'Manglar' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre!: string;

  @ApiPropertyOptional({ example: 'Raíces firmes, crecimiento constante.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  lema?: string;
}

export class UpdateGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  lema?: string;
}

export class SetMembersDto {
  @ApiProperty({ type: [String], description: 'Reemplaza la lista completa de integrantes.' })
  @IsArray()
  @IsUUID('4', { each: true })
  userIds!: string[];
}

export class QueryGroupsDto {
  @ApiPropertyOptional({ enum: ['activos', 'inactivos', 'todos'], default: 'activos' })
  @IsOptional()
  @IsIn(['activos', 'inactivos', 'todos'])
  estado?: 'activos' | 'inactivos' | 'todos';
}
