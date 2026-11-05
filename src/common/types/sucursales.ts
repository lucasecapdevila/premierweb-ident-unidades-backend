export type SucursalId = 1 | 2 | 3 | 9;

export interface Sucursal {
  id: SucursalId;
  nombre: string;
  ciudad: string;
  codigo: string;
}