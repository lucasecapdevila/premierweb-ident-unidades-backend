import type { RowDataPacket } from 'mysql2/promise';

export interface StockConsolidadoRow extends RowDataPacket {
  articulo_id: number;
  codart: number;
  descripcion: string | null;
  modelo: string | null;
  rubro: number | null;
  precio: number | string | null;
  stk_agu: number | string | null;
  stk_alb: number | string | null;
  stk_con: number | string | null;
  stk_smt: number | string | null;
  stk_total: number | string | null;
  vta_total: number | string | null;
}

export interface StockArticuloItem {
  articuloId: number;
  codart: number;
  codartFormateado: string;
  descripcion: string;
  modelo: string | null;
  rubro: number | null;
  precio: number;
  stockPorSucursal: {
    agu: number;
    alb: number;
    con: number;
    smt: number;
    total: number;
  };
  ventasTotales: number;
}

export interface StockSummaryResponse {
  kpis: {
    totalActivas: number;
    agu: number;
    alb: number;
    con: number;
    smt: number;
    totalVendidas: number;
  };
  items: StockArticuloItem[];
}
