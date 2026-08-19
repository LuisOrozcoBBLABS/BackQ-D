import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ana@bblabs.io' })
  @IsEmail({}, { message: 'Correo inválido.' })
  email!: string;

  @ApiPropertyOptional({
    description: 'Contexto opcional para el administrador que va a atenderlo.',
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  nota?: string;
}
