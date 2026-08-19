import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@bblabs.io' })
  @IsEmail({}, { message: 'Correo inválido.' })
  email!: string;

  @ApiProperty({ example: 'una-clave-larga' })
  @IsString()
  @MinLength(1, { message: 'Ingresa tu contraseña.' })
  password!: string;
}
