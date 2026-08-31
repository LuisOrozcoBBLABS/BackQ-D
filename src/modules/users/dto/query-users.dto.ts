import { ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma, RoleId } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Campos por los que se PUEDE ordenar, a nivel de tipo. `keyof
 * UserOrderByWithRelationInput` por si solo no alcanza: incluye TODOS los
 * escalares del modelo, `passwordHash` y `refreshTokenHash` entre ellos, asi
 * que agregarlos a la lista blanca compilaria sin protestar. Y ordenar por una
 * columna que nunca se devuelve es un oraculo: con `skip`/`take` y suficientes
 * consultas se puede reconstruir el orden relativo de los hashes.
 */
type CampoOrdenableUsuario = Exclude<
  keyof Prisma.UserOrderByWithRelationInput,
  'passwordHash' | 'refreshTokenHash'
>;

/** Lista blanca de orden. Ver el comentario en query-projects.dto.ts. */
export const ORDEN_USUARIOS = [
  'nombre',
  'email',
  'cargo',
  'createdAt',
  'ultimoLoginAt',
] as const satisfies readonly CampoOrdenableUsuario[];
export type OrdenUsuarios = (typeof ORDEN_USUARIOS)[number];

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
  @ApiPropertyOptional({ enum: ORDEN_USUARIOS })
  @IsOptional()
  @IsIn(ORDEN_USUARIOS)
  sort?: OrdenUsuarios;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';


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
