import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ResultSetHeader } from 'mysql2/promise';
import { DatabaseService } from '../database/database.service.js';
import { CreateIdentificacionDto } from './dto/create-identificacion.dto.js';
import { UpdateIdentificacionDto } from './dto/update-identificacion.dto.js';
import { AnularIdentificacionDto } from './dto/anular-identificacion.dto.js';
import { FilterIdentificacionesDto } from './dto/filter-identificaciones.dto.js';
import type {
  CountRow,
  IdentificacionJoinedRow,
  IdentificacionResponse,
  JlvArticuloRow,
  PaginatedIdentificacionesResponse,
  SecuenciaRow,
  SqlParam,
} from '../common/types/index.js';

const SECUENCIA_TIPO = 'IDENT_UNIDAD';

@Injectable()
export class IdentificacionesService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Genera una nueva identificación interna de forma atómica y segura frente a concurrencia.
   */
  async create(
    dto: CreateIdentificacionDto,
    usuarioId: number,
  ): Promise<IdentificacionResponse> {
    const insertedId = await this.databaseService.withTransaction<number>(
      async (connection) => {
        // 1. Verificar que el artículo exista, esté activo y pertenezca a rubros 13 o 14
        const [articulos] = await connection.execute<JlvArticuloRow[]>(
          `SELECT id, jlv_codart, jlv_desc, jlv_modelo, jlv_rubro, jlv_estado
           FROM jlv_articulo
           WHERE id = ?
             AND (id_borrado IS NULL OR id_borrado = '')
             AND (jlv_estado IS NULL OR jlv_estado <> 9)
             AND jlv_rubro IN (13, 14)
             AND jlv_codart IS NOT NULL
             AND jlv_codart BETWEEN 1 AND 9999
           LIMIT 1`,
          [dto.articuloId],
        );

        const articulo = articulos[0];
        if (!articulo) {
          throw new BadRequestException(
            `El artículo seleccionado (ID ${dto.articuloId}) no existe, está inactivo o no pertenece a los rubros habilitados (13 o 14)`,
          );
        }

        // 2. Bloquear exclusivamente la fila IDENT_UNIDAD en la tabla secuencias
        const [secuencias] = await connection.execute<SecuenciaRow[]>(
          `SELECT id, tipo, valor_actual, estado
           FROM secuencias
           WHERE tipo = ?
             AND id_borrado = ''
             AND estado <> 9
           LIMIT 1
           FOR UPDATE`,
          [SECUENCIA_TIPO],
        );

        const secuencia = secuencias[0];
        if (!secuencia) {
          throw new InternalServerErrorException(
            `No se encontró una secuencia activa para '${SECUENCIA_TIPO}' en la tabla secuencias`,
          );
        }

        // 3. Calcular siguiente correlativo global y actualizar secuencias
        const nuevoCorrelativo = Number(secuencia.valor_actual) + 1;

        await connection.execute<ResultSetHeader>(
          `UPDATE secuencias
           SET valor_actual = ?,
               fecha_actualizacion = CURDATE(),
               hora_actualizacion = CURTIME()
           WHERE id = ?`,
          [nuevoCorrelativo, secuencia.id],
        );

        // 4. Construir el identificador AAAA-NNNNN (amplía a 6+ dígitos si supera 99999 sin truncar)
        const codartFormateado = String(articulo.jlv_codart).padStart(4, '0');
        const correlativoFormateado = String(nuevoCorrelativo).padStart(5, '0');
        const codigoIdentificador = `${codartFormateado}-${correlativoFormateado}`;

        // 5. Persistir el registro en identificacion_unidad
        const [insertResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO identificacion_unidad (
            id_borrado,
            codigo_identificador,
            correlativo,
            articulo_id,
            codart_snapshot,
            nro_chasis_original,
            nro_motor_original,
            color,
            motivo_asignacion,
            observaciones,
            estado,
            usuario_creacion_id,
            fecha_asignacion,
            fecha_actualizacion
          ) VALUES (
            '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', ?, NOW(), NOW()
          )`,
          [
            codigoIdentificador,
            nuevoCorrelativo,
            articulo.id,
            articulo.jlv_codart,
            this.normalizeOptionalString(dto.nroChasisOriginal),
            this.normalizeOptionalString(dto.nroMotorOriginal),
            this.normalizeOptionalString(dto.color),
            dto.motivoAsignacion ?? 'ESTANDAR',
            this.normalizeOptionalString(dto.observaciones),
            usuarioId,
          ],
        );

        return insertResult.insertId;
      },
    );

    // 6. Confirmada la transacción, devolver el registro completo persistido
    return this.findOneByIdOrCodigo(String(insertedId));
  }

  /**
   * Listado paginado y búsqueda multicriterio (identificador, codart, descripción, chasis, motor).
   */
  async findAll(
    filterDto: FilterIdentificacionesDto,
  ): Promise<PaginatedIdentificacionesResponse> {
    const { search, estado, codart, page = 1, limit = 25 } = filterDto;
    const whereClauses: string[] = ["iu.id_borrado = ''"];
    const params: SqlParam[] = [];

    if (estado) {
      whereClauses.push('iu.estado = ?');
      params.push(estado);
    }

    if (codart !== undefined) {
      whereClauses.push('iu.codart_snapshot = ?');
      params.push(codart);
    }

    if (search && search.trim() !== '') {
      const term = `%${search.trim()}%`;
      whereClauses.push(`(
        iu.codigo_identificador LIKE ?
        OR CAST(iu.codart_snapshot AS CHAR) LIKE ?
        OR a.jlv_desc LIKE ?
        OR iu.nro_chasis_original LIKE ?
        OR iu.nro_motor_original LIKE ?
      )`);
      params.push(term, term, term, term, term);
    }

    const whereSql = whereClauses.join(' AND ');
    const safeLimit = Math.min(Math.max(Number(limit), 1), 100);
    const safePage = Math.max(Number(page), 1);
    const offset = (safePage - 1) * safeLimit;

    const countRows = await this.databaseService.query<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM identificacion_unidad iu
       LEFT JOIN jlv_articulo a ON a.id = iu.articulo_id
       WHERE ${whereSql}`,
      params,
    );

    const total = Number(countRows[0]?.total ?? 0);

    const rows = await this.databaseService.query<IdentificacionJoinedRow[]>(
      `${this.getBaseSelectSql()}
       WHERE ${whereSql}
       ORDER BY iu.correlativo DESC
       LIMIT ${safeLimit} OFFSET ${offset}`,
      params,
    );

    return {
      data: rows.map((row) => this.mapRowToResponse(row)),
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  }

  /**
   * Consulta una identificación tanto por su ID numérico como por su código AAAA-NNNNN.
   */
  async findOneByIdOrCodigo(
    idOrCodigo: string,
  ): Promise<IdentificacionResponse> {
    const trimmed = idOrCodigo.trim();
    const isNumericId = /^\d+$/.test(trimmed);

    const whereCondition = isNumericId
      ? "iu.id = ? AND iu.id_borrado = ''"
      : "iu.codigo_identificador = ? AND iu.id_borrado = ''";

    const paramValue: SqlParam = isNumericId ? Number(trimmed) : trimmed;

    const rows = await this.databaseService.query<IdentificacionJoinedRow[]>(
      `${this.getBaseSelectSql()}
       WHERE ${whereCondition}
       LIMIT 1`,
      [paramValue],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException(
        `No se encontró ninguna unidad con identificador o ID '${idOrCodigo}'`,
      );
    }

    return this.mapRowToResponse(row);
  }

  /**
   * Actualiza únicamente datos descriptivos. El identificador, correlativo y artículo son inmutables.
   */
  async updateDatosDescriptivos(
    id: number,
    dto: UpdateIdentificacionDto,
  ): Promise<IdentificacionResponse> {
    const actual = await this.findOneByIdOrCodigo(String(id));

    if (actual.estado === 'ANULADO') {
      throw new ConflictException(
        `La identificación ${actual.codigoIdentificador} está ANULADA y no puede ser modificada`,
      );
    }

    const nroChasis =
      dto.nroChasisOriginal !== undefined
        ? this.normalizeOptionalString(dto.nroChasisOriginal)
        : actual.nroChasisOriginal;

    const nroMotor =
      dto.nroMotorOriginal !== undefined
        ? this.normalizeOptionalString(dto.nroMotorOriginal)
        : actual.nroMotorOriginal;

    const color =
      dto.color !== undefined
        ? this.normalizeOptionalString(dto.color)
        : actual.color;

    const motivoAsignacion =
      dto.motivoAsignacion !== undefined
        ? dto.motivoAsignacion
        : actual.motivoAsignacion;

    const observaciones =
      dto.observaciones !== undefined
        ? this.normalizeOptionalString(dto.observaciones)
        : actual.observaciones;

    await this.databaseService.execute(
      `UPDATE identificacion_unidad
       SET nro_chasis_original = ?,
           nro_motor_original = ?,
           color = ?,
           motivo_asignacion = ?,
           observaciones = ?,
           fecha_actualizacion = NOW()
       WHERE id = ? AND id_borrado = ''`,
      [nroChasis, nroMotor, color, motivoAsignacion, observaciones, id],
    );

    return this.findOneByIdOrCodigo(String(id));
  }

  /**
   * Anula una identificación conservando el registro y su correlativo bloqueado.
   */
  async anular(
    id: number,
    dto: AnularIdentificacionDto,
    usuarioId: number,
  ): Promise<IdentificacionResponse> {
    const actual = await this.findOneByIdOrCodigo(String(id));

    if (actual.estado === 'ANULADO') {
      throw new ConflictException(
        `La identificación ${actual.codigoIdentificador} ya se encuentra ANULADA`,
      );
    }

    await this.databaseService.execute(
      `UPDATE identificacion_unidad
       SET estado = 'ANULADO',
           motivo_anulacion = ?,
           usuario_anulacion_id = ?,
           fecha_anulacion = NOW(),
           fecha_actualizacion = NOW()
       WHERE id = ? AND id_borrado = ''`,
      [dto.motivoAnulacion.trim(), usuarioId, id],
    );

    return this.findOneByIdOrCodigo(String(id));
  }

  private getBaseSelectSql(): string {
    return `
      SELECT
        iu.id,
        iu.codigo_identificador,
        iu.correlativo,
        iu.articulo_id,
        iu.codart_snapshot,
        iu.nro_chasis_original,
        iu.nro_motor_original,
        iu.color,
        iu.motivo_asignacion,
        iu.observaciones,
        iu.estado,
        iu.motivo_anulacion,
        iu.usuario_creacion_id,
        iu.usuario_anulacion_id,
        iu.fecha_asignacion,
        iu.fecha_actualizacion,
        iu.fecha_anulacion,
        a.jlv_desc AS articulo_desc,
        a.jlv_modelo AS articulo_modelo,
        a.jlv_rubro AS articulo_rubro,
        uc.jlv_nombres AS usuario_creacion_nombre,
        ua.jlv_nombres AS usuario_anulacion_nombre
      FROM identificacion_unidad iu
      LEFT JOIN jlv_articulo a ON a.id = iu.articulo_id
      LEFT JOIN jlv_usuarios uc ON uc.id = iu.usuario_creacion_id
      LEFT JOIN jlv_usuarios ua ON ua.id = iu.usuario_anulacion_id
    `;
  }

  private normalizeOptionalString(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  private mapRowToResponse(
    row: IdentificacionJoinedRow,
  ): IdentificacionResponse {
    const codartFormateado = String(row.codart_snapshot).padStart(4, '0');
    return {
      id: row.id,
      codigoIdentificador: row.codigo_identificador,
      correlativo: row.correlativo,
      articulo: {
        id: row.articulo_id,
        codart: row.codart_snapshot,
        codartFormateado,
        descripcion: (row.articulo_desc ?? '').trim(),
        modelo: row.articulo_modelo ? row.articulo_modelo.trim() : null,
        rubro: row.articulo_rubro,
      },
      nroChasisOriginal: row.nro_chasis_original,
      nroMotorOriginal: row.nro_motor_original,
      color: row.color,
      motivoAsignacion: row.motivo_asignacion,
      observaciones: row.observaciones,
      estado: row.estado,
      motivoAnulacion: row.motivo_anulacion,
      usuarioCreacion: {
        id: row.usuario_creacion_id,
        nombre: row.usuario_creacion_nombre
          ? row.usuario_creacion_nombre.trim()
          : null,
      },
      usuarioAnulacion: row.usuario_anulacion_id
        ? {
            id: row.usuario_anulacion_id,
            nombre: row.usuario_anulacion_nombre
              ? row.usuario_anulacion_nombre.trim()
              : null,
          }
        : null,
      fechaAsignacion: row.fecha_asignacion,
      fechaActualizacion: row.fecha_actualizacion,
      fechaAnulacion: row.fecha_anulacion,
    };
  }
}