import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { JwtUserPayload } from '../interfaces/jwt-payload.interface.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUserPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: JwtUserPayload }>();
    return request.user;
  },
);