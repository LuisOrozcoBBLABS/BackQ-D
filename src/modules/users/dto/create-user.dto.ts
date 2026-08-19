import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleId } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Ana Gómez' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;

  @ApiProperty({ example: 'ana@bblabs.io' })
  @IsEmail({}, { message: 'Correo inválido.' })
  email!: string;

  @ApiPropertyOptional({ example: 'AI Engineer' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cargo?: string;

  /**
   * Contraseña inicial. El usuario está obligado a cambiarla en su primer ingreso
   * (debeCambiarPassword = true). La API nunca devuelve contraseñas.
   */
  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'La contraseña inicial debe tener al menos 10 caracteres.' })
  password!: string;

  @ApiProperty({ enum: RoleId, example: RoleId.colaborador })
  @IsEnum(RoleId)
  rol!: RoleId;

  @ApiPropertyOptional({ description: 'Id del grupo. Null o ausente = sin grupo.' })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Permisos extra sobre los del rol.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permisosExtra?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
