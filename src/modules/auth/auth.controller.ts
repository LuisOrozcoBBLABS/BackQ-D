import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequestUser } from '../../common/types/request-user';
import { AuthService } from './auth.service';
import { ResetRequestsService } from '../password-resets/reset-requests.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly resets: ResetRequestsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // freno a fuerza bruta
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia sesión y devuelve el par de tokens.' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } }) // no dejar barrer correos
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Pide que un administrador restablezca la contraseña.',
    description:
      'Responde 204 exista o no la cuenta: contestar distinto permitiria averiguar que correos estan registrados.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.resets.solicitar(dto.email, dto.nota);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rota el refresh token y devuelve tokens nuevos.' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cierra la sesión e invalida el refresh token.' })
  async logout(@CurrentUser() user: RequestUser): Promise<void> {
    await this.auth.logout(user.id);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Devuelve el usuario autenticado con sus permisos efectivos.' })
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user.id);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cambia la contraseña del usuario autenticado.' })
  async changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto): Promise<void> {
    await this.auth.changePassword(user.id, dto.actual, dto.nueva);
  }
}
