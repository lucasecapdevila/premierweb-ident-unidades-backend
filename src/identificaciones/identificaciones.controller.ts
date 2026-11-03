import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IdentificacionesService } from './identificaciones.service.js';
import { CreateIdentificacionDto } from './dto/create-identificacion.dto.js';
import { UpdateIdentificacionDto } from './dto/update-identificacion.dto.js';
import { AnularIdentificacionDto } from './dto/anular-identificacion.dto.js';
import { FilterIdentificacionesDto } from './dto/filter-identificaciones.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtUserPayload } from '../common/types/index.js';
import { VenderIdentificacionDto } from './dto/vender-identificacion.dto.js';

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

  @Get()
  async findAll(@Query() filterDto: FilterIdentificacionesDto) {
    return this.identificacionesService.findAll(filterDto);
  }

  @Get(':idOrCodigo')
  async findOne(@Param('idOrCodigo') idOrCodigo: string) {
    return this.identificacionesService.findOneByIdOrCodigo(idOrCodigo);
  }

  @Patch(':id')
  async updateDatosDescriptivos(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateIdentificacionDto,
  ) {
    return this.identificacionesService.updateDatosDescriptivos(id, updateDto);
  }

  @Patch(':id/anular')
  async anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() anularDto: AnularIdentificacionDto,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.identificacionesService.anular(id, anularDto, user.sub);
  }

  @Patch(':id/vender')
  async marcarVendida(
    @Param('id', ParseIntPipe) id: number,
    @Body() venderDto: VenderIdentificacionDto,
  ) {
    return this.identificacionesService.marcarVendida(id, venderDto);
  }

  @Patch(':id/reactivar')
  async reactivarVenta(@Param('id', ParseIntPipe) id: number) {
    return this.identificacionesService.reactivarVenta(id);
  }
}