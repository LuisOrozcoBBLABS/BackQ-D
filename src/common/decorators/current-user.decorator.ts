import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { RequestUser } from '../types/request-user';

/** Inyecta el usuario del token ya validado. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  return ctx.switchToHttp().getRequest<{ user: RequestUser }>().user;
});
