import { Module } from '@nestjs/common';
import { PasswordResetsModule } from '../password-resets/password-resets.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PasswordResetsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
