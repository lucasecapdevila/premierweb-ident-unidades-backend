import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { JwtUserPayload } from '../common/types/index.js';
import { LoginDto } from './dto/index.js';
import { JwtAuthGuard, CurrentUser } from '../common/index.js';
import { AuthService } from './index.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: JwtUserPayload) {
    return this.authService.getProfile(user);
  }
}
