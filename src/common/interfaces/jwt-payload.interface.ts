export interface JwtUserPayload {
  sub: number;
  usuario: string;
  nombres: string;
  grupo: string | null;
}