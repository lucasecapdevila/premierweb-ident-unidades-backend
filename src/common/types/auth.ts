import { RowDataPacket } from 'mysql2/promise';

export interface JlvUsuarioRow extends RowDataPacket {
  id: number;
  jlv_usuario: string;
  jlv_contrasena: string | null;
  jlv_nombres: string | null;
  jlv_grupo: string | null;
  jlv_esgrupo: number | null;
}

export interface JwtUserPayload {
  sub: number;
  usuario: string;
  nombres: string;
  grupo: string | null;
}

export interface AuthUserResponse {
  id: number;
  usuario: string;
  nombres: string;
  grupo: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUserResponse;
}
