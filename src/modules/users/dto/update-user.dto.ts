import { ApiPropertyOptional } from '@nestjs/swagger';
import { RoleId } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Edición de un usuario por parte de un admin (permiso users.manage).
 * No incluye contraseña: eso se cambia desde /auth/change-password o con reset.
 */
export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  @ApiPropertyOptional({ description: 'El cargo solo lo edita un admin, no la propia persona.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cargo?: string;

  @ApiPropertyOptional({ enum: RoleId })
  @IsOptional()
  @IsEnum(RoleId)
  rol?: RoleId;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permisosExtra?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
