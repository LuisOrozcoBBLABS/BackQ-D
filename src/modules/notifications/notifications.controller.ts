import { Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-user';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Notificaciones del usuario autenticado.' })
  findMine(@CurrentUser() user: RequestUser) {
    return this.notifications.findMine(user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Cuántas quedan sin leer (para la campana).' })
  unread(@CurrentUser() user: RequestUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marca una notificación como leída.' })
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.notifications.markRead(id, user.id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Marca todas como leídas.' })
  markAll(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllRead(user.id);
  }
}
