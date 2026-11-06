import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ArticuloResponse,
  JlvArticuloRow,
  SqlParam,
} from '../common/index.js';
import { DatabaseService } from '../database/index.js';
import { FilterArticulosDto } from './dto/index.js';

@Injectable()
export class ArticulosService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAllCatalogo(
    filterDto: FilterArticulosDto,
  ): Promise<ArticuloResponse[]> {
    const { search, rubro, limit = 30 } = filterDto;

    const whereClauses: string[] = [
      "(id_borrado IS NULL OR id_borrado = '')",
      '(jlv_estado IS NULL OR jlv_estado <> 9)',
      'jlv_rubro IN (13, 14)',
      'jlv_codart IS NOT NULL',
      'jlv_codart BETWEEN 1 AND 9999',
    ];
    const params: SqlParam[] = [];

    if (rubro) {
      whereClauses.push('jlv_rubro = ?');
      params.push(rubro);
    }

    if (search && search.trim() !== '') {
      const term = `%${search.trim()}%`;
      whereClauses.push(
        '(CAST(jlv_codart AS CHAR) LIKE ? OR jlv_desc LIKE ? OR jlv_modelo LIKE ?)',
      );
      params.push(term, term, term);
    }

    const safeLimit = Math.min(Math.max(Number(limit), 1), 100);

    const rows = await this.databaseService.queryRead<JlvArticuloRow[]>(
      `SELECT id, jlv_codart, jlv_codbarra, jlv_desc, jlv_modelo, jlv_rubro, jlv_colorart, jlv_estado
       FROM jlv_articulo
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY jlv_codart ASC
       LIMIT ${safeLimit}`,
      params,
    );

    return rows.map((row) => ({
      id: row.id,
      codart: row.jlv_codart,
      codartFormateado: String(row.jlv_codart).padStart(4, '0'),
      codbarra: row.jlv_codbarra ? row.jlv_codbarra.trim() : null,
      descripcion: (row.jlv_desc ?? '').trim(),
      modelo: row.jlv_modelo ? row.jlv_modelo.trim() : null,
      rubro: row.jlv_rubro,
      rubroNombre: row.jlv_rubro === 13 ? 'Bicicletas' : 'Vehículos Eléctricos',
      colorCodigo: row.jlv_colorart ? row.jlv_colorart.trim() : null,
    }));
  }

  async findAll(filterDto: FilterArticulosDto): Promise<ArticuloResponse[]> {
    return this.findAllCatalogo(filterDto);
  }

  async findOneById(id: number): Promise<ArticuloResponse> {
    const rows = await this.databaseService.queryRead<JlvArticuloRow[]>(
      `SELECT id, jlv_codart, jlv_codbarra, jlv_desc, jlv_modelo, jlv_rubro, jlv_colorart, jlv_estado
       FROM jlv_articulo
       WHERE id = ?
         AND (id_borrado IS NULL OR id_borrado = '')
         AND (jlv_estado IS NULL OR jlv_estado <> 9)
       LIMIT 1`,
      [id],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`Artículo con ID ${id} no encontrado`);
    }

    return {
      id: row.id,
      codart: row.jlv_codart,
      codartFormateado: String(row.jlv_codart).padStart(4, '0'),
      codbarra: row.jlv_codbarra ? row.jlv_codbarra.trim() : null,
      descripcion: (row.jlv_desc ?? '').trim(),
      modelo: row.jlv_modelo ? row.jlv_modelo.trim() : null,
      rubro: row.jlv_rubro,
      rubroNombre: row.jlv_rubro === 13 ? 'Bicicletas' : 'Vehículos Eléctricos',
      colorCodigo: row.jlv_colorart ? row.jlv_colorart.trim() : null,
    };
  }
}
