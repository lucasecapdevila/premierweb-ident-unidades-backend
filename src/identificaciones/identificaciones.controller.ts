import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  JwtAuthGuard,
  type JwtUserPayload,
} from '../common/index.js';
import {
  AnularIdentificacionDto,
  CreateBulkIdentificacionDto,
  CreateIdentificacionDto,
  FilterIdentificacionesDto,
  FilterStockDto,
  UpdateIdentificacionDto,
  VenderIdentificacionDto,
} from './dto/index.js';
import { IdentificacionesService } from './identificaciones.service.js';

@Controller('identificaciones')
@UseGuards(JwtAuthGuard)
export class IdentificacionesController {
  constructor(
    private readonly identificacionesService: IdentificacionesService,
  ) {}

  @Post()
  async create(
    @Body() createDto: CreateIdentificacionDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.identificacionesService.create(createDto, user.sub);
  }

  @Post('bulk')
  async createBulk(
    @Body() createBulkDto: CreateBulkIdentificacionDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.identificacionesService.createBulk(createBulkDto, user.sub);
  }

  @Get()
  async findAll(@Query() filterDto: FilterIdentificacionesDto) {
    return this.identificacionesService.findAll(filterDto);
  }

  @Get('export/excel')
  async exportExcel(
    @Query() filterDto: FilterIdentificacionesDto,
    @Res() res: Response,
  ) {
    const buffer = await this.identificacionesService.exportExcel(filterDto);
    const fecha = new Date().toISOString().slice(0, 10);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Auditoria_Unidades_${fecha}.xlsx"`,
    );
    res.send(buffer);
  }

  @Get('stock')
  async getStock(@Query() filterStockDto: FilterStockDto) {
    return this.identificacionesService.getStockSummary(filterStockDto);
  }

  @Get(':idOrCodigo')
  async findOne(@Param('idOrCodigo') idOrCodigo: string) {
    return this.identificacionesService.findOneByIdOrCodigo(idOrCodigo);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateIdentificacionDto,
  ) {
    return this.identificacionesService.updateDatosDescriptivos(id, updateDto);
  }

  @Patch(':id/vender')
  async vender(
    @Param('id', ParseIntPipe) id: number,
    @Body() venderDto: VenderIdentificacionDto,
  ) {
    return this.identificacionesService.marcarVendida(id, venderDto);
  }

  @Patch(':id/reactivar')
  async reactivar(@Param('id', ParseIntPipe) id: number) {
    return this.identificacionesService.reactivarVenta(id);
  }

  @Patch(':id/anular')
  async anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() anularDto: AnularIdentificacionDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.identificacionesService.anular(id, anularDto, user.sub);
  }
}
