import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  SUCURSALES_IDS,
  type MotivoAsignacion,
  type SucursalId,
} from '../../common/index.js';

const MOTIVOS_VALIDOS: MotivoAsignacion[] = [
  'ESTANDAR',
  'SIN_NUMERO_ORIGINAL',
  'ILEGIBLE',
  'INACCESIBLE',
];

export class UpdateIdentificacionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sucursalId debe ser un número entero' })
  @IsIn(SUCURSALES_IDS, {
    message: 'sucursalId debe ser una sucursal válida (1, 2, 3 o 9)',
  })
  sucursalId?: SucursalId;

  @IsOptional()
  @IsString()
  @MaxLength(50, {
    message: 'El número de chasis no puede superar 50 caracteres',
  })
  nroChasisOriginal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, {
    message: 'El número de motor no puede superar 50 caracteres',
  })
  nroMotorOriginal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'El color no puede superar 30 caracteres' })
  color?: string;

  @IsOptional()
  @IsString()
  @IsIn(MOTIVOS_VALIDOS, {
    message:
      'motivoAsignacion debe ser ESTANDAR, SIN_NUMERO_ORIGINAL, ILEGIBLE o INACCESIBLE',
  })
  motivoAsignacion?: MotivoAsignacion;

  @IsOptional()
  @IsString()
  @MaxLength(255, {
    message: 'Las observaciones no pueden superar 255 caracteres',
  })
  observaciones?: string;
}