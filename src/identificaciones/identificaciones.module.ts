import { Module } from '@nestjs/common';
import {
  IdentificacionesController,
  IdentificacionesService,
} from './index.js';

@Module({
  controllers: [IdentificacionesController],
  providers: [IdentificacionesService],
  exports: [IdentificacionesService],
})
export class IdentificacionesModule {}
