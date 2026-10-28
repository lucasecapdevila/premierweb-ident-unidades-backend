import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { FilterArticulosDto } from './dto/filter-articulos.dto.js';
import type {
  ArticuloResponse,
  JlvArticuloRow,
  SqlParam,
} from '../common/types/index.js';


@Injectable()
export class ArticulosService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(filterDto: FilterArticulosDto): Promise<ArticuloResponse[]> {
    const { search, rubro, limit = 30 } = filterDto;
    const params: SqlParam[] = [];

    let sql = `
      SELECT 
        id,
        jlv_codart,
        jlv_codbarra,
        jlv_rubro,
        jlv_desc,
        jlv_modelo,
        jlv_colorart,
        jlv_estado
      FROM jlv_articulo
      WHERE (id_borrado IS NULL OR id_borrado = '')
        AND (jlv_estado IS NULL OR jlv_estado <> 9)
        AND jlv_rubro IN (13, 14)
        AND jlv_codart IS NOT NULL
        AND jlv_codart BETWEEN 1 AND 9999
    `;

    if (rubro) {
      sql += ` AND jlv_rubro = ?`;
      params.push(rubro);
    }

    if (search && search.trim() !== '') {
      const term = `%${search.trim()}%`;
      sql += ` AND (
        CAST(jlv_codart AS CHAR) LIKE ?
        OR jlv_desc LIKE ?
      )`;
      params.push(term, term);
    }

    sql += ` ORDER BY jlv_codart ASC LIMIT ${Number(limit)}`;

    const rows = await this.databaseService.query<JlvArticuloRow[]>(
      sql,
      params,
    );
    return rows.map((row) => this.mapRowToResponse(row));
  }

  async findOneById(id: number): Promise<ArticuloResponse> {
    const rows = await this.databaseService.query<JlvArticuloRow[]>(
      `SELECT 
        id,
        jlv_codart,
        jlv_codbarra,
        jlv_rubro,
        jlv_desc,
        jlv_modelo,
        jlv_colorart,
        jlv_estado
      FROM jlv_articulo
      WHERE id = ?
        AND (id_borrado IS NULL OR id_borrado = '')
        AND (jlv_estado IS NULL OR jlv_estado <> 9)
        AND jlv_rubro IN (13, 14)
        AND jlv_codart IS NOT NULL
        AND jlv_codart BETWEEN 1 AND 9999
      LIMIT 1`,
      [id],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException(
        `El artículo con ID ${id} no existe, no está activo o no pertenece a los rubros habilitados (13 o 14)`,
      );
    }

    return this.mapRowToResponse(row);
  }

  private mapRowToResponse(row: JlvArticuloRow): ArticuloResponse {
    const codartFormateado = String(row.jlv_codart).padStart(4, '0');
    return {
      id: row.id,
      codart: row.jlv_codart,
      codartFormateado,
      codbarra: row.jlv_codbarra ? row.jlv_codbarra.trim() : null,
      rubro: row.jlv_rubro,
      rubroNombre: row.jlv_rubro === 13 ? 'BICICLETAS' : 'ELÉCTRICOS',
      descripcion: (row.jlv_desc ?? '').trim(),
      modelo: row.jlv_modelo ? row.jlv_modelo.trim() : null,
      colorCodigo: row.jlv_colorart ? row.jlv_colorart.trim() : null,
    };
  }
}