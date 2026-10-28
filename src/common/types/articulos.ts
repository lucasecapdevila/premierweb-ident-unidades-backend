import { RowDataPacket } from 'mysql2/promise';

export interface JlvArticuloRow extends RowDataPacket {
  id: number;
  jlv_codart: number;
  jlv_codbarra: string | null;
  jlv_rubro: number;
  jlv_desc: string | null;
  jlv_modelo: string | null;
  jlv_colorart: string | null;
  jlv_estado: number | null;
}

export interface ArticuloResponse {
  id: number;
  codart: number;
  codartFormateado: string;
  codbarra: string | null;
  rubro: number;
  rubroNombre: string;
  descripcion: string;
  modelo: string | null;
  colorCodigo: string | null;
}