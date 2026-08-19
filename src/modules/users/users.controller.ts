import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('permissions')
  @ApiOperation({ summary: 'Catálogo de permisos de la plataforma.' })
  permisos() {
    return this.users.permissionsCatalog();
  }

  @Get('roles')
  @ApiOperation({ summary: 'Roles con sus permisos base.' })
  roles() {
    return this.users.rolesCatalog();
  }

  @Get('users')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Lista usuarios con filtros y paginación.' })
  findAll(@Query() q: QueryUsersDto) {
    return this.users.findAll(q);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Detalle de un usuario. Sin users.manage, solo el propio.' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actual: RequestUser) {
    if (id !== actual.id && !actual.permisos.includes('users.manage')) {
      throw new ForbiddenException('Solo puedes ver tu propio perfil.');
    }
    return this.users.findOne(id);
  }

  @Post('users')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Crea un usuario con contraseña inicial de un solo uso.' })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch('users/:id')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Edita rol, grupo, cargo y permisos extra.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Patch('users/:id/enable')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Reactiva una cuenta.' })
  enable(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actual: RequestUser) {
    return this.users.setActivo(id, true, actual.id);
  }

  @Patch('users/:id/disable')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Desactiva una cuenta y cierra sus sesiones. No borra datos.' })
  disable(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actual: RequestUser) {
    return this.users.setActivo(id, false, actual.id);
  }

  @Post('users/:id/reset-password')
  @RequirePermission('users.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Asigna una contraseña temporal. La persona debe cambiarla al entrar.' })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    await this.users.resetPassword(id, dto.nueva);
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Actualiza el perfil propio (foto, LinkedIn, teléfono, onboarding).' })
  updateProfile(@CurrentUser() actual: RequestUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(actual.id, dto);
  }
}
