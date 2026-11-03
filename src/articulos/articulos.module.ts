import { Module } from '@nestjs/common';
import { ArticulosController, ArticulosService } from './index.js';

@Module({
  controllers: [ArticulosController],
  providers: [ArticulosService],
  exports: [ArticulosService],
})
export class ArticulosModule {}
