import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { JwtUserPayload } from '../types/index.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUserPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: JwtUserPayload }>();
    return request.user;
  },
);