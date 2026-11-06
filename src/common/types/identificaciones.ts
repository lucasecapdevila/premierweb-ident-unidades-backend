import type { RowDataPacket } from 'mysql2/promise';
import type { Sucursal } from './sucursales.js';

export type EstadoIdentificacion = 'ACTIVO' | 'ANULADO' | 'VENDIDA';

export type MotivoAsignacion =
  'ESTANDAR' | 'SIN_NUMERO_ORIGINAL' | 'ILEGIBLE' | 'INACCESIBLE';

export interface SecuenciaRow extends RowDataPacket {
  id: number;
  tipo: string;
  valor_actual: number;
  estado: number;
}

export interface IdentificacionBaseRow extends RowDataPacket {
  id: number;
  codigo_identificador: string;
  correlativo: number;
  articulo_id: number;
  sucursal_id: number;
  codart_snapshot: number;
  nro_chasis_original: string | null;
  nro_motor_original: string | null;
  color: string | null;
  motivo_asignacion: MotivoAsignacion;
  observaciones: string | null;
  estado: EstadoIdentificacion;
  motivo_anulacion: string | null;
  usuario_creacion_id: number;
  usuario_anulacion_id: number | null;
  fecha_asignacion: Date | string;
  fecha_actualizacion: Date | string;
  fecha_venta: Date | string | null;
  fecha_anulacion: Date | string | null;
}

export interface IdentificacionJoinedRow extends IdentificacionBaseRow {
  articulo_desc: string | null;
  articulo_modelo: string | null;
  articulo_rubro: number | null;
  usuario_creacion_nombre: string | null;
  usuario_anulacion_nombre: string | null;
}

export interface UsuarioLookupRow extends RowDataPacket {
  id: number;
  jlv_nombres: string | null;
}

export interface IdentificacionResponse {
  id: number;
  codigoIdentificador: string;
  correlativo: number;
  articulo: {
    id: number;
    codart: number;
    codartFormateado: string;
    descripcion: string;
    modelo: string | null;
    rubro: number | null;
  };
  sucursal: Sucursal;
  nroChasisOriginal: string | null;
  nroMotorOriginal: string | null;
  color: string | null;
  motivoAsignacion: MotivoAsignacion;
  observaciones: string | null;
  estado: EstadoIdentificacion;
  motivoAnulacion: string | null;
  usuarioCreacion: {
    id: number;
    nombre: string | null;
  };
  usuarioAnulacion: {
    id: number;
    nombre: string | null;
  } | null;
  fechaAsignacion: Date | string;
  fechaActualizacion: Date | string;
  fechaVenta: Date | string | null;
  fechaAnulacion: Date | string | null;
}

export interface PaginatedIdentificacionesResponse {
  data: IdentificacionResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface BulkCreateIdentificacionesResponse {
  cantidadCreada: number;
  primerCodigo: string;
  ultimoCodigo: string;
  items: IdentificacionResponse[];
}
