import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ArticulosService } from './index.js';
import { FilterArticulosDto } from './dto/index.js';
import { JwtAuthGuard } from '../common/index.js';

@Controller('articulos')
@UseGuards(JwtAuthGuard)
export class ArticulosController {
  constructor(private readonly articulosService: ArticulosService) {}

  @Get()
  async findAll(@Query() filterDto: FilterArticulosDto) {
    return this.articulosService.findAll(filterDto);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.articulosService.findOneById(id);
  }
}
