import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  actual!: string;

  @ApiProperty({ minLength: 10, description: 'Mínimo 10 caracteres.' })
  @IsString()
  @MinLength(10, { message: 'La nueva contraseña debe tener al menos 10 caracteres.' })
  nueva!: string;
}
