import type { RowDataPacket } from 'mysql2/promise';

export type SqlParam = string | number | boolean | Date | Buffer | null;

export interface CountRow extends RowDataPacket {
  total: number;
}
