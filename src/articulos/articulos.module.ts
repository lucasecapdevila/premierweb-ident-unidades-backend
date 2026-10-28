import { Module } from '@nestjs/common';
import { ArticulosController } from './articulos.controller.js';
import { ArticulosService } from './articulos.service.js';

@Module({
  controllers: [ArticulosController],
  providers: [ArticulosService],
  exports: [ArticulosService],
})
export class ArticulosModule {}