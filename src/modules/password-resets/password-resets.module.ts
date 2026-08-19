import { Module } from '@nestjs/common';
import { ResetRequestsService } from './reset-requests.service';

/**
 * Vive aparte porque lo necesitan auth (para el pedido publico) y users (para
 * atenderlo). Si users importara auth habria dependencia circular.
 */
@Module({
  providers: [ResetRequestsService],
  exports: [ResetRequestsService],
})
export class PasswordResetsModule {}
