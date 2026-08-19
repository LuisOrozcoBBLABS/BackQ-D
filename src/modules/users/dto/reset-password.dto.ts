import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ minLength: 10, description: 'Contraseña temporal. Se exige cambiarla al ingresar.' })
  @IsString()
  @MinLength(10, { message: 'La contraseña temporal debe tener al menos 10 caracteres.' })
  nueva!: string;
}
