import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/dto/auth.module.js';
import { ArticulosModule } from './articulos/articulos.module.js';
import { IdentificacionesModule } from './identificaciones/identificaciones.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthModule,
    ArticulosModule,
    IdentificacionesModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}