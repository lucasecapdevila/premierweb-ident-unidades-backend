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
  type ArticuloCatalogoExcelRow,
  type BulkCreateIdentificacionesResponse,
  type CountRow,
  type IdentificacionBaseRow,
  type IdentificacionJoinedRow,
  type IdentificacionResponse,
  type JlvArticuloRow,
  type PaginatedIdentificacionesResponse,
  type SecuenciaRow,
  type SqlParam,
  type StockAgrupadoWriteRow,
  type StockArticuloItem,
  type StockSummaryResponse,
  type UsuarioLookupRow,
} from '../common/index.js';
import { DatabaseService } from '../database/index.js';
import {
  AnularIdentificacionDto,
  CreateBulkIdentificacionDto,
  CreateIdentificacionDto,
  FilterIdentificacionesDto,
  FilterStockDto,
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
    const articulo = await this.validateArticuloInReadDb(dto.articuloId);

    const insertedId = await this.databaseService.withWriteTransaction<number>(
      async (connection) => {
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

        const nuevoCorrelativo = Number(secuencia.valor_actual) + 1;

        await connection.execute<ResultSetHeader>(
          `UPDATE secuencias
           SET valor_actual = ?,
               fecha_actualizacion = CURDATE(),
               hora_actualizacion = CURTIME()
           WHERE id = ?`,
          [nuevoCorrelativo, secuencia.id],
        );

        const codartFormateado = String(articulo.jlv_codart).padStart(4, '0');
        const correlativoFormateado = String(nuevoCorrelativo).padStart(5, '0');
        const codigoIdentificador = `${codartFormateado}-${correlativoFormateado}`;

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
    const articulo = await this.validateArticuloInReadDb(dto.articuloId);

    const { correlativoInicial, correlativoFinal } =
      await this.databaseService.withWriteTransaction<{
        correlativoInicial: number;
        correlativoFinal: number;
      }>(async (connection) => {
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

    const baseRows = await this.databaseService.queryWrite<
      IdentificacionBaseRow[]
    >(
      `${this.getBaseSelectSql()}
       WHERE iu.correlativo BETWEEN ? AND ?
         AND iu.id_borrado = ''
       ORDER BY iu.correlativo ASC`,
      [correlativoInicial, correlativoFinal],
    );

    const items = await this.hydrateIdentificaciones(baseRows);

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
    const { page = 1, limit = 25 } = filterDto;
    const { whereSql, params } = await this.buildWhereClause(filterDto);

    const safeLimit = Math.min(Math.max(Number(limit), 1), 100);
    const safePage = Math.max(Number(page), 1);
    const offset = (safePage - 1) * safeLimit;

    const countRows = await this.databaseService.queryWrite<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM identificacion_unidad iu
       WHERE ${whereSql}`,
      params,
    );

    const total = Number(countRows[0]?.total ?? 0);

    const baseRows = await this.databaseService.queryWrite<
      IdentificacionBaseRow[]
    >(
      `${this.getBaseSelectSql()}
       WHERE ${whereSql}
       ORDER BY iu.correlativo DESC
       LIMIT ${safeLimit} OFFSET ${offset}`,
      params,
    );

    const data = await this.hydrateIdentificaciones(baseRows);

    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  }

  async findOneByIdOrCodigo(
    idOrCodigo: string,
  ): Promise<IdentificacionResponse> {
    const trimmed = idOrCodigo.trim();
    const isNumericId = /^\d+$/.test(trimmed);

    const whereCondition = isNumericId
      ? "iu.id = ? AND iu.id_borrado = ''"
      : "iu.codigo_identificador = ? AND iu.id_borrado = ''";

    const paramValue: SqlParam = isNumericId ? Number(trimmed) : trimmed;

    const baseRows = await this.databaseService.queryWrite<
      IdentificacionBaseRow[]
    >(
      `${this.getBaseSelectSql()}
       WHERE ${whereCondition}
       LIMIT 1`,
      [paramValue],
    );

    if (baseRows.length === 0) {
      throw new NotFoundException(
        `No se encontró ninguna unidad con identificador o ID '${idOrCodigo}'`,
      );
    }

    const hydrated = await this.hydrateIdentificaciones(baseRows);
    return hydrated[0];
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

    await this.databaseService.executeWrite(
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

    await this.databaseService.executeWrite(
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

    await this.databaseService.executeWrite(
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

    await this.databaseService.executeWrite(
      `UPDATE identificacion_unidad
       SET estado = 'ACTIVO',
           fecha_venta = NULL,
           fecha_actualizacion = NOW()
       WHERE id = ? AND id_borrado = ''`,
      [id],
    );

    return this.findOneByIdOrCodigo(String(id));
  }

  async getStockSummary(
    filterDto: FilterStockDto,
  ): Promise<StockSummaryResponse> {
    const { search, rubro, soloConStock } = filterDto;
    const articulos = await this.fetchCatalogoForReport(search, rubro);

    const stockRows = await this.databaseService.queryWrite<
      StockAgrupadoWriteRow[]
    >(
      `SELECT
        iu.articulo_id,
        SUM(CASE WHEN iu.estado = 'ACTIVO' AND iu.sucursal_id = 1 THEN 1 ELSE 0 END) AS stk_agu,
        SUM(CASE WHEN iu.estado = 'ACTIVO' AND iu.sucursal_id = 2 THEN 1 ELSE 0 END) AS stk_alb,
        SUM(CASE WHEN iu.estado = 'ACTIVO' AND iu.sucursal_id = 3 THEN 1 ELSE 0 END) AS stk_con,
        SUM(CASE WHEN iu.estado = 'ACTIVO' AND iu.sucursal_id = 9 THEN 1 ELSE 0 END) AS stk_smt,
        SUM(CASE WHEN iu.estado = 'ACTIVO' THEN 1 ELSE 0 END) AS stk_total,
        SUM(CASE WHEN iu.estado = 'VENDIDA' THEN 1 ELSE 0 END) AS vta_total
       FROM identificacion_unidad iu
       WHERE iu.id_borrado = ''
       GROUP BY iu.articulo_id`,
    );

    const stockMap = new Map<number, StockAgrupadoWriteRow>(
      stockRows.map((r) => [Number(r.articulo_id), r]),
    );

    const kpis = {
      totalActivas: 0,
      agu: 0,
      alb: 0,
      con: 0,
      smt: 0,
      totalVendidas: 0,
    };

    const items: StockArticuloItem[] = [];

    for (const art of articulos) {
      const st = stockMap.get(art.id);
      const agu = Number(st?.stk_agu ?? 0);
      const alb = Number(st?.stk_alb ?? 0);
      const con = Number(st?.stk_con ?? 0);
      const smt = Number(st?.stk_smt ?? 0);
      const total = Number(st?.stk_total ?? 0);
      const ventas = Number(st?.vta_total ?? 0);

      if (soloConStock && total <= 0) {
        continue;
      }

      kpis.agu += agu;
      kpis.alb += alb;
      kpis.con += con;
      kpis.smt += smt;
      kpis.totalActivas += total;
      kpis.totalVendidas += ventas;

      items.push({
        articuloId: art.id,
        codart: art.codart,
        codartFormateado: String(art.codart).padStart(4, '0'),
        descripcion: (art.descripcion ?? '').trim(),
        modelo: art.modelo ? art.modelo.trim() : null,
        rubro: art.rubro,
        precio: Number(art.precio ?? 0),
        stockPorSucursal: { agu, alb, con, smt, total },
        ventasTotales: ventas,
      });
    }

    items.sort(
      (a, b) =>
        b.stockPorSucursal.total - a.stockPorSucursal.total ||
        a.codart - b.codart,
    );

    return { kpis, items };
  }

  async exportExcel(filterDto: FilterIdentificacionesDto): Promise<Buffer> {
    const { search, rubro, startDate, endDate } = filterDto;
    const articulos = await this.fetchCatalogoForReport(search, rubro);

    const dateWhereVentas: string[] = [];
    const writeParams: SqlParam[] = [];

    if (startDate && startDate.trim() !== '') {
      dateWhereVentas.push('iu.fecha_venta >= ?');
      writeParams.push(`${startDate.trim()} 00:00:00`);
    }
    if (endDate && endDate.trim() !== '') {
      dateWhereVentas.push('iu.fecha_venta <= ?');
      writeParams.push(`${endDate.trim()} 23:59:59`);
    }

    const dateVentasSql =
      dateWhereVentas.length > 0 ? `AND ${dateWhereVentas.join(' AND ')}` : '';

    // Si hay parámetros de fecha, se repiten 5 veces (para las 5 columnas de ventas)
    const allWriteParams: SqlParam[] =
      writeParams.length > 0
        ? [
            ...writeParams,
            ...writeParams,
            ...writeParams,
            ...writeParams,
            ...writeParams,
          ]
        : [];

    const stockRows = await this.databaseService.queryWrite<
      StockAgrupadoWriteRow[]
    >(
      `SELECT
        iu.articulo_id,
        SUM(CASE WHEN iu.estado = 'ACTIVO' AND iu.sucursal_id = 1 THEN 1 ELSE 0 END) AS stk_agu,
        SUM(CASE WHEN iu.estado = 'ACTIVO' AND iu.sucursal_id = 2 THEN 1 ELSE 0 END) AS stk_alb,
        SUM(CASE WHEN iu.estado = 'ACTIVO' AND iu.sucursal_id = 3 THEN 1 ELSE 0 END) AS stk_con,
        SUM(CASE WHEN iu.estado = 'ACTIVO' AND iu.sucursal_id = 9 THEN 1 ELSE 0 END) AS stk_smt,
        SUM(CASE WHEN iu.estado = 'ACTIVO' THEN 1 ELSE 0 END) AS stk_total,
        SUM(CASE WHEN iu.estado = 'VENDIDA' AND iu.sucursal_id = 1 ${dateVentasSql} THEN 1 ELSE 0 END) AS vta_agu,
        SUM(CASE WHEN iu.estado = 'VENDIDA' AND iu.sucursal_id = 2 ${dateVentasSql} THEN 1 ELSE 0 END) AS vta_alb,
        SUM(CASE WHEN iu.estado = 'VENDIDA' AND iu.sucursal_id = 3 ${dateVentasSql} THEN 1 ELSE 0 END) AS vta_con,
        SUM(CASE WHEN iu.estado = 'VENDIDA' AND iu.sucursal_id = 9 ${dateVentasSql} THEN 1 ELSE 0 END) AS vta_smt,
        SUM(CASE WHEN iu.estado = 'VENDIDA' ${dateVentasSql} THEN 1 ELSE 0 END) AS vta_total
       FROM identificacion_unidad iu
       WHERE iu.id_borrado = ''
       GROUP BY iu.articulo_id`,
      allWriteParams,
    );

    const stockMap = new Map<number, StockAgrupadoWriteRow>(
      stockRows.map((r) => [Number(r.articulo_id), r]),
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Broal E-Bikes - Sistema de Identificación';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Reporte Consolidado');

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

    for (const art of articulos) {
      const st = stockMap.get(art.id);
      sheet.addRow({
        codart: String(art.codart).padStart(4, '0'),
        desc: (art.descripcion ?? '').trim(),
        agu: Number(st?.stk_agu ?? 0),
        con: Number(st?.stk_con ?? 0),
        alb: Number(st?.stk_alb ?? 0),
        smt: Number(st?.stk_smt ?? 0),
        total: Number(st?.stk_total ?? 0),
        costo: Number(art.costo ?? 0),
        perc: Number(art.perc ?? 0),
        precio: Number(art.precio ?? 0),
        fina: Number(art.fina ?? 0),
        anticipo: Number(art.anticipo ?? 0),
        plan: Number(art.plan ?? 0),
        precio_cuo: Number(art.precio_cuo ?? 0),
        tot_financ: Number(art.plan ?? 0),
        vta_agu: Number(st?.vta_agu ?? 0),
        vta_alb: Number(st?.vta_alb ?? 0),
        vta_con: Number(st?.vta_con ?? 0),
        vta_smt: Number(st?.vta_smt ?? 0),
        vta_total: Number(st?.vta_total ?? 0),
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
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

  private async validateArticuloInReadDb(
    articuloId: number,
  ): Promise<JlvArticuloRow> {
    const articulos = await this.databaseService.queryRead<JlvArticuloRow[]>(
      `SELECT id, jlv_codart, jlv_desc, jlv_modelo, jlv_rubro, jlv_estado
       FROM jlv_articulo
       WHERE id = ?
         AND (id_borrado IS NULL OR id_borrado = '')
         AND (jlv_estado IS NULL OR jlv_estado <> 9)
         AND jlv_rubro IN (13, 14)
         AND jlv_codart IS NOT NULL
         AND jlv_codart BETWEEN 1 AND 9999
       LIMIT 1`,
      [articuloId],
    );

    const articulo = articulos[0];
    if (!articulo) {
      throw new BadRequestException(
        `El artículo seleccionado (ID ${articuloId}) no existe, está inactivo o no pertenece a los rubros habilitados (13 o 14)`,
      );
    }

    return articulo;
  }

  private async fetchCatalogoForReport(
    search?: string,
    rubro?: number,
  ): Promise<ArticuloCatalogoExcelRow[]> {
    const whereClauses: string[] = [
      "(a.id_borrado IS NULL OR a.id_borrado = '')",
      '(a.jlv_estado IS NULL OR a.jlv_estado <> 9)',
      'a.jlv_rubro IN (13, 14)',
      'a.jlv_codart IS NOT NULL',
      'a.jlv_codart BETWEEN 1 AND 9999',
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

    return this.databaseService.queryRead<ArticuloCatalogoExcelRow[]>(
      `SELECT
        a.id,
        a.jlv_codart AS codart,
        a.jlv_desc AS descripcion,
        a.jlv_modelo AS modelo,
        a.jlv_rubro AS rubro,
        a.jlv_prco AS costo,
        a.jlv_perc AS perc,
        a.jlv_prpu AS precio,
        a.jlv_fina AS fina,
        a.jlv_anticipo AS anticipo,
        a.jlv_pre_final AS plan,
        a.jlv_precio_cuo AS precio_cuo
       FROM jlv_articulo a
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY a.jlv_codart ASC`,
      params,
    );
  }

  private async buildWhereClause(
    filterDto: FilterIdentificacionesDto,
  ): Promise<{
    whereSql: string;
    params: SqlParam[];
  }> {
    const { search, estado, codart, sucursalId, startDate, endDate } =
      filterDto;
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

    if (sucursalId !== undefined) {
      whereClauses.push('iu.sucursal_id = ?');
      params.push(sucursalId);
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
      // Buscar artículos que coincidan por descripción en Base A (Lectura)
      const matchingArts = await this.databaseService.queryRead<
        JlvArticuloRow[]
      >(
        `SELECT id FROM jlv_articulo
         WHERE jlv_desc LIKE ? AND jlv_rubro IN (13, 14)
         LIMIT 200`,
        [term],
      );

      if (matchingArts.length > 0) {
        const idsPlaceholders = matchingArts.map(() => '?').join(', ');
        whereClauses.push(`(
          iu.codigo_identificador LIKE ?
          OR CAST(iu.codart_snapshot AS CHAR) LIKE ?
          OR iu.nro_chasis_original LIKE ?
          OR iu.nro_motor_original LIKE ?
          OR iu.articulo_id IN (${idsPlaceholders})
        )`);
        params.push(term, term, term, term, ...matchingArts.map((a) => a.id));
      } else {
        whereClauses.push(`(
          iu.codigo_identificador LIKE ?
          OR CAST(iu.codart_snapshot AS CHAR) LIKE ?
          OR iu.nro_chasis_original LIKE ?
          OR iu.nro_motor_original LIKE ?
        )`);
        params.push(term, term, term, term);
      }
    }

    return {
      whereSql: whereClauses.join(' AND '),
      params,
    };
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
        iu.fecha_anulacion
      FROM identificacion_unidad iu
    `;
  }

  private async hydrateIdentificaciones(
    rows: IdentificacionBaseRow[],
  ): Promise<IdentificacionResponse[]> {
    if (rows.length === 0) return [];

    const articuloIds = [...new Set(rows.map((r) => r.articulo_id))];
    const usuarioIds = [
      ...new Set(
        rows
          .flatMap((r) => [r.usuario_creacion_id, r.usuario_anulacion_id])
          .filter((id): id is number => id !== null && id !== undefined),
      ),
    ];

    const articulosMap = new Map<number, JlvArticuloRow>();
    if (articuloIds.length > 0) {
      const artPlaceholders = articuloIds.map(() => '?').join(', ');
      const artRows = await this.databaseService.queryRead<JlvArticuloRow[]>(
        `SELECT id, jlv_codart, jlv_desc, jlv_modelo, jlv_rubro, jlv_estado
         FROM jlv_articulo
         WHERE id IN (${artPlaceholders})`,
        articuloIds,
      );
      for (const art of artRows) {
        articulosMap.set(art.id, art);
      }
    }

    const usuariosMap = new Map<number, string | null>();
    if (usuarioIds.length > 0) {
      const usrPlaceholders = usuarioIds.map(() => '?').join(', ');
      const usrRows = await this.databaseService.queryRead<UsuarioLookupRow[]>(
        `SELECT id, jlv_nombres
         FROM jlv_usuarios
         WHERE id IN (${usrPlaceholders})`,
        usuarioIds,
      );
      for (const usr of usrRows) {
        usuariosMap.set(usr.id, usr.jlv_nombres);
      }
    }

    return rows.map((row) => {
      const art = articulosMap.get(row.articulo_id);
      const joinedRow: IdentificacionJoinedRow = {
        ...row,
        articulo_desc: art?.jlv_desc ?? null,
        articulo_modelo: art?.jlv_modelo ?? null,
        articulo_rubro: art?.jlv_rubro ?? null,
        usuario_creacion_nombre:
          usuariosMap.get(row.usuario_creacion_id) ?? null,
        usuario_anulacion_nombre: row.usuario_anulacion_id
          ? (usuariosMap.get(row.usuario_anulacion_id) ?? null)
          : null,
      };
      return this.mapRowToResponse(joinedRow);
    });
  }
}
