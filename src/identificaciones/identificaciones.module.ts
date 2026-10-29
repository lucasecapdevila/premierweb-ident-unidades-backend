import { Module } from '@nestjs/common';
import { IdentificacionesController } from './identificaciones.controller.js';
import { IdentificacionesService } from './identificaciones.service.js';

@Module({
  controllers: [IdentificacionesController],
  providers: [IdentificacionesService],
  exports: [IdentificacionesService],
})
export class IdentificacionesModule {}