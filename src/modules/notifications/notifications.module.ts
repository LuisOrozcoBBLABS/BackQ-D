import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { DispatcherService } from './dispatcher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, DispatcherService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
