import type { Sucursal, SucursalId } from '../types/index.js';

export const SUCURSAL_CASA_CENTRAL: Sucursal = {
  id: 1,
  nombre: 'Casa Central',
  ciudad: 'Aguilares',
  codigo: 'AGU',
};

export const SUCURSALES: readonly Sucursal[] = [
  SUCURSAL_CASA_CENTRAL,
  { id: 2, nombre: 'Alberdi', ciudad: 'Juan Bautista Alberdi', codigo: 'ALB' },
  { id: 3, nombre: 'Concepción', ciudad: 'Concepción', codigo: 'CON' },
  {
    id: 9,
    nombre: 'S.M. de Tucumán',
    ciudad: 'San Miguel de Tucumán',
    codigo: 'TUC',
  },
];

export const SUCURSALES_IDS: readonly SucursalId[] = [1, 2, 3, 9];

export function getSucursalById(id?: number | null): Sucursal {
  if (!id) return SUCURSAL_CASA_CENTRAL;
  return SUCURSALES.find((s) => s.id === id) ?? SUCURSAL_CASA_CENTRAL;
}
