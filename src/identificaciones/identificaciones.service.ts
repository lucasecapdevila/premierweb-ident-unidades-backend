import ExcelJS from 'exceljs';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  getSucursalById,
  type BulkCreateIdentificacionesResponse,
  type IdentificacionJoinedRow,
  type IdentificacionResponse,
  type JlvArticuloRow,
  type PaginatedIdentificacionesResponse,
  type SecuenciaRow,
  type CountRow,
  type SqlParam,
} from '../common/index.js';
import { DatabaseService } from '../database/index.js';
import {
  AnularIdentificacionDto,
  CreateBulkIdentificacionDto,
  CreateIdentificacionDto,
  FilterIdentificacionesDto,
  UpdateIdentificacionDto,
  VenderIdentificacionDto,
} from './dto/index.js';

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
    const sucursal = getSucursalById(dto.sucursalId);
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
            sucursal_id,
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
            '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', ?, NOW(), NOW()
          )`,
          [
            codigoIdentificador,
            nuevoCorrelativo,
            articulo.id,
            sucursal.id,
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
   * Genera un lote masivo de identificaciones (2 a 100 unidades) en una única transacción ACID.
   * Reserva el bloque de correlativos en un solo paso e inserta todas las filas en bloque.
   */
  async createBulk(
    dto: CreateBulkIdentificacionDto,
    usuarioId: number,
  ): Promise<BulkCreateIdentificacionesResponse> {
    const cantidad = Number(dto.cantidad);
    const sucursal = getSucursalById(dto.sucursalId);

    const { correlativoInicial, correlativoFinal } =
      await this.databaseService.withTransaction<{
        correlativoInicial: number;
        correlativoFinal: number;
      }>(async (connection) => {
        // 1. Verificar artículo activo en rubros 13 o 14
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

        // 2. Bloquear exclusivamente la fila IDENT_UNIDAD en secuencias
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

        // 3. Reservar bloque completo de correlativos de una sola vez
        const valorBase = Number(secuencia.valor_actual);
        const inicio = valorBase + 1;
        const fin = valorBase + cantidad;

        await connection.execute<ResultSetHeader>(
          `UPDATE secuencias
           SET valor_actual = ?,
               fecha_actualizacion = CURDATE(),
               hora_actualizacion = CURTIME()
           WHERE id = ?`,
          [fin, secuencia.id],
        );

        // 4. Armar inserción multi-fila (batch insert)
        const codartFormateado = String(articulo.jlv_codart).padStart(4, '0');
        const colorNormalizado = this.normalizeOptionalString(dto.color);
        const motivo = dto.motivoAsignacion ?? 'ESTANDAR';
        const obsNormalizada = this.normalizeOptionalString(dto.observaciones);

        const valuesPlaceholders: string[] = [];
        const insertParams: SqlParam[] = [];

        for (let corr = inicio; corr <= fin; corr++) {
          const correlativoFormateado = String(corr).padStart(5, '0');
          const codigoIdentificador = `${codartFormateado}-${correlativoFormateado}`;

          valuesPlaceholders.push(
            "('', ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 'ACTIVO', ?, NOW(), NOW())",
          );
          insertParams.push(
            codigoIdentificador,
            corr,
            articulo.id,
            sucursal.id,
            articulo.jlv_codart,
            colorNormalizado,
            motivo,
            obsNormalizada,
            usuarioId,
          );
        }

        await connection.execute<ResultSetHeader>(
          `INSERT INTO identificacion_unidad (
            id_borrado,
            codigo_identificador,
            correlativo,
            articulo_id,
            sucursal_id,
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
          ) VALUES ${valuesPlaceholders.join(', ')}`,
          insertParams,
        );

        return { correlativoInicial: inicio, correlativoFinal: fin };
      });

    // 5. Recuperar todos los registros creados en el lote ordenados de forma ascendente
    const rows = await this.databaseService.query<IdentificacionJoinedRow[]>(
      `${this.getBaseSelectSql()}
       WHERE iu.correlativo BETWEEN ? AND ?
         AND iu.id_borrado = ''
       ORDER BY iu.correlativo ASC`,
      [correlativoInicial, correlativoFinal],
    );

    const items = rows.map((row) => this.mapRowToResponse(row));

    return {
      cantidadCreada: items.length,
      primerCodigo: items[0]?.codigoIdentificador ?? '',
      ultimoCodigo: items[items.length - 1]?.codigoIdentificador ?? '',
      items,
    };
  }

  /**
   * Listado paginado y búsqueda multicriterio (identificador, codart, descripción, chasis, motor).
   */
  async findAll(
    filterDto: FilterIdentificacionesDto,
  ): Promise<PaginatedIdentificacionesResponse> {
    const {
      search,
      estado,
      codart,
      sucursalId,
      startDate,
      endDate,
      page = 1,
      limit = 25,
    } = filterDto;
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

    if (startDate && startDate.trim() !== '') {
      whereClauses.push('iu.fecha_asignacion >= ?');
      params.push(`${startDate.trim()} 00:00:00`);
    }

    if (endDate && endDate.trim() !== '') {
      whereClauses.push('iu.fecha_asignacion <= ?');
      params.push(`${endDate.trim()} 23:59:59`);
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

    if (sucursalId !== undefined) {
      whereClauses.push('iu.sucursal_id = ?');
      params.push(sucursalId);
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

    const sucursalId =
      dto.sucursalId !== undefined
        ? getSucursalById(dto.sucursalId).id
        : actual.sucursal.id;

    await this.databaseService.execute(
      `UPDATE identificacion_unidad
       SET sucursal_id = ?,
           nro_chasis_original = ?,
           nro_motor_original = ?,
           color = ?,
           motivo_asignacion = ?,
           observaciones = ?,
           fecha_actualizacion = NOW()
       WHERE id = ? AND id_borrado = ''`,
      [
        sucursalId,
        nroChasis,
        nroMotor,
        color,
        motivoAsignacion,
        observaciones,
        id,
      ],
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

  /**
   * Marca una unidad ACTIVA como VENDIDA, registrando fecha_venta y actualizando observaciones si se proveen.
   */
  async marcarVendida(
    id: number,
    dto: VenderIdentificacionDto,
  ): Promise<IdentificacionResponse> {
    const actual = await this.findOneByIdOrCodigo(String(id));

    if (actual.estado === 'ANULADO') {
      throw new ConflictException(
        `La identificación ${actual.codigoIdentificador} está ANULADA y no puede marcarse como VENDIDA`,
      );
    }

    if (actual.estado === 'VENDIDA') {
      throw new ConflictException(
        `La identificación ${actual.codigoIdentificador} ya se encuentra registrada como VENDIDA`,
      );
    }

    const nuevasObservaciones =
      dto.observaciones !== undefined
        ? this.normalizeOptionalString(dto.observaciones)
        : actual.observaciones;

    await this.databaseService.execute(
      `UPDATE identificacion_unidad
       SET estado = 'VENDIDA',
           observaciones = ?,
           fecha_venta = NOW(),
           fecha_actualizacion = NOW()
       WHERE id = ? AND id_borrado = ''`,
      [nuevasObservaciones, id],
    );

    return this.findOneByIdOrCodigo(String(id));
  }

  /**
   * Revierte una unidad VENDIDA al estado ACTIVO (ej. devolución o error de carga), limpiando fecha_venta.
   */
  async reactivarVenta(id: number): Promise<IdentificacionResponse> {
    const actual = await this.findOneByIdOrCodigo(String(id));

    if (actual.estado !== 'VENDIDA') {
      throw new ConflictException(
        `Solo se puede reactivar una unidad que esté en estado VENDIDA (estado actual: ${actual.estado})`,
      );
    }

    await this.databaseService.execute(
      `UPDATE identificacion_unidad
       SET estado = 'ACTIVO',
           fecha_venta = NULL,
           fecha_actualizacion = NOW()
       WHERE id = ? AND id_borrado = ''`,
      [id],
    );

    return this.findOneByIdOrCodigo(String(id));
  }

  /**
   * Genera un archivo Excel (.xlsx) consolidado por artículo con desglose de stock por sucursal,
   * datos financieros de jlv_articulo y contadores de ventas.
   */
  async exportExcel(filterDto: FilterIdentificacionesDto): Promise<Buffer> {
    const { search, rubro, startDate, endDate } = filterDto;
    const whereClauses: string[] = [
      "(a.id_borrado IS NULL OR a.id_borrado = '')",
      '(a.jlv_estado IS NULL OR a.jlv_estado <> 9)',
      'a.jlv_rubro IN (13, 14)',
      'a.jlv_codart IS NOT NULL',
    ];
    const params: SqlParam[] = [];

    if (rubro !== undefined) {
      whereClauses.push('a.jlv_rubro = ?');
      params.push(rubro);
    }

    if (search && search.trim() !== '') {
      const term = `%${search.trim()}%`;
      whereClauses.push(`(
        CAST(a.jlv_codart AS CHAR) LIKE ?
        OR a.jlv_desc LIKE ?
        OR a.jlv_modelo LIKE ?
      )`);
      params.push(term, term, term);
    }

    // Filtros opcionales de fecha para acotar el cálculo de ventas si se proveen
    const dateWhereVentas: string[] = [];
    if (startDate && startDate.trim() !== '') {
      dateWhereVentas.push('iu.fecha_venta >= ?');
      params.push(`${startDate.trim()} 00:00:00`);
    }
    if (endDate && endDate.trim() !== '') {
      dateWhereVentas.push('iu.fecha_venta <= ?');
      params.push(`${endDate.trim()} 23:59:59`);
    }
    const dateVentasSql =
      dateWhereVentas.length > 0 ? `AND ${dateWhereVentas.join(' AND ')}` : '';

    const sql = `
      SELECT 
        a.jlv_codart AS codart,
        a.jlv_desc AS descripcion,
        a.jlv_prco AS costo,
        a.jlv_perc AS perc,
        a.jlv_prpu AS precio,
        a.jlv_fina AS fina,
        a.jlv_anticipo AS anticipo,
        a.jlv_pre_final AS plan,
        a.jlv_precio_cuo AS precio_cuo,
        -- Stock ACTIVO por sucursal (1: AGU, 2: ALB, 3: CON, 9: SMT)
        SUM(CASE WHEN iu.estado = 'ACTIVO' AND iu.sucursal_id = 1 THEN 1 ELSE 0 END) AS stk_agu,
        SUM(CASE WHEN iu.estado = 'ACTIVO' AND iu.sucursal_id = 2 THEN 1 ELSE 0 END) AS stk_alb,
        SUM(CASE WHEN iu.estado = 'ACTIVO' AND iu.sucursal_id = 3 THEN 1 ELSE 0 END) AS stk_con,
        SUM(CASE WHEN iu.estado = 'ACTIVO' AND iu.sucursal_id = 9 THEN 1 ELSE 0 END) AS stk_smt,
        SUM(CASE WHEN iu.estado = 'ACTIVO' THEN 1 ELSE 0 END) AS stk_total,
        -- Ventas VENDIDA por sucursal (o según sucursal origen)
        SUM(CASE WHEN iu.estado = 'VENDIDA' AND iu.sucursal_id = 1 ${dateVentasSql} THEN 1 ELSE 0 END) as vta_agu,
        SUM(CASE WHEN iu.estado = 'VENDIDA' AND iu.sucursal_id = 2 ${dateVentasSql} THEN 1 ELSE 0 END) as vta_alb,
        SUM(CASE WHEN iu.estado = 'VENDIDA' AND iu.sucursal_id = 3 ${dateVentasSql} THEN 1 ELSE 0 END) as vta_con,
        SUM(CASE WHEN iu.estado = 'VENDIDA' AND iu.sucursal_id = 9 ${dateVentasSql} THEN 1 ELSE 0 END) as vta_smt,
        SUM(CASE WHEN iu.estado = 'VENDIDA' ${dateVentasSql} THEN 1 ELSE 0 END) as vta_total
      FROM jlv_articulo a
      LEFT JOIN identificacion_unidad iu ON iu.articulo_id = a.id AND (iu.id_borrado IS NULL OR iu.id_borrado = '')
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY a.jlv_codart, a.jlv_desc, a.jlv_prco, a.jlv_perc, a.jlv_prpu, a.jlv_fina, a.jlv_anticipo, a.jlv_pre_final, a.jlv_precio_cuo
      ORDER BY a.jlv_codart ASC
    `;

    const rows = await this.databaseService.query<RowDataPacket[]>(sql, params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Broal E-Bikes - Sistema de Identificación';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Reporte Consolidado');

    // Columnas exactas solicitadas
    sheet.columns = [
      { header: 'codart', key: 'codart', width: 12 },
      { header: 'desc', key: 'desc', width: 35 },
      { header: 'agu', key: 'agu', width: 10 },
      { header: 'con', key: 'con', width: 10 },
      { header: 'alb', key: 'alb', width: 10 },
      { header: 'smt', key: 'smt', width: 10 },
      { header: 'total', key: 'total', width: 10 },
      { header: 'costo (jlv_prco)', key: 'costo', width: 16 },
      { header: 'perc', key: 'perc', width: 12 },
      { header: 'precio (jlv_prpu)', key: 'precio', width: 16 },
      { header: 'fina', key: 'fina', width: 12 },
      { header: 'anticipo', key: 'anticipo', width: 16 },
      { header: 'plan', key: 'plan', width: 16 },
      { header: 'precio_cuo', key: 'precio_cuo', width: 16 },
      { header: 'tot_financ', key: 'tot_financ', width: 16 },
      { header: 'Ventas AGU', key: 'vta_agu', width: 14 },
      { header: 'Ventas ALB', key: 'vta_alb', width: 14 },
      { header: 'Ventas CON', key: 'vta_con', width: 14 },
      { header: 'Ventas SMT', key: 'vta_smt', width: 14 },
      { header: 'Total Ventas', key: 'vta_total', width: 14 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };

    for (const row of rows) {
      const costo = Number(row.costo ?? 0);
      const fina = Number(row.fina ?? 0);
      // tot_financ calculado como estimado o basado en plan / precio
      const totFinanc = Number(row.plan ?? 0);

      sheet.addRow({
        codart: String(row.codart).padStart(4, '0'),
        desc: (row.descripcion ?? '').trim(),
        agu: Number(row.stk_agu ?? 0),
        con: Number(row.stk_con ?? 0),
        alb: Number(row.stk_alb ?? 0),
        smt: Number(row.stk_smt ?? 0),
        total: Number(row.stk_total ?? 0),
        costo: costo,
        perc: Number(row.perc ?? 0),
        precio: Number(row.precio ?? 0),
        fina: fina,
        anticipo: Number(row.anticipo ?? 0),
        plan: Number(row.plan ?? 0),
        precio_cuo: Number(row.precio_cuo ?? 0),
        tot_financ: totFinanc,
        vta_agu: Number(row.vta_agu ?? 0),
        vta_alb: Number(row.vta_alb ?? 0),
        vta_con: Number(row.vta_con ?? 0),
        vta_smt: Number(row.vta_smt ?? 0),
        vta_total: Number(row.vta_total ?? 0),
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private getBaseSelectSql(): string {
    return `
      SELECT
        iu.id,
        iu.codigo_identificador,
        iu.correlativo,
        iu.articulo_id,
        iu.sucursal_id,
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
        iu.fecha_venta,
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
    const sucursal = getSucursalById(row.sucursal_id);
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
      sucursal,
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
      fechaVenta: row.fecha_venta,
      fechaAnulacion: row.fecha_anulacion,
    };
  }
}
