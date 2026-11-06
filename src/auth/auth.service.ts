import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service.js';
import { LoginDto } from './dto/login.dto.js';
import type { JlvUsuarioRow, JwtUserPayload } from '../common/types/index.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const usuarioInput = dto.usuario.trim();

    const rows = await this.databaseService.queryRead<JlvUsuarioRow[]>(
      `SELECT id, jlv_usuario, jlv_contrasena, jlv_nombres
       FROM jlv_usuarios
       WHERE LOWER(TRIM(jlv_usuario)) = LOWER(TRIM(?))
         AND (id_borrado IS NULL OR id_borrado = '')
       LIMIT 1`,
      [dto.usuario],
    );

    const user = rows[0];

    if (!user || (user.jlv_contrasena ?? '') !== dto.contrasena) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const payload: JwtUserPayload = {
      sub: user.id,
      usuario: user.jlv_usuario.trim(),
      nombres: (user.jlv_nombres ?? user.jlv_usuario).trim(),
      grupo: user.jlv_grupo ? user.jlv_grupo.trim() : null,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: payload.sub,
        usuario: payload.usuario,
        nombres: payload.nombres,
        grupo: payload.grupo,
      },
    };
  }

  async getProfile(userPayload: JwtUserPayload) {
    return {
      id: userPayload.sub,
      usuario: userPayload.usuario,
      nombres: userPayload.nombres,
      grupo: userPayload.grupo,
    };
  }
}
