import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/index.js';
import { AuthModule } from './auth/index.js';
import { ArticulosModule } from './articulos/index.js';
import { IdentificacionesModule } from './identificaciones/index.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthModule,
    ArticulosModule,
    IdentificacionesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
