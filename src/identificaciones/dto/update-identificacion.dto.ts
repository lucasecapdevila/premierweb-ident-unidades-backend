import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { MotivoAsignacion } from '../../common/types/index.js';

const MOTIVOS_VALIDOS: MotivoAsignacion[] = [
  'ESTANDAR',
  'SIN_NUMERO_ORIGINAL',
  'ILEGIBLE',
  'INACCESIBLE',
];

export class UpdateIdentificacionDto {
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'El número de chasis no puede superar 50 caracteres' })
  nroChasisOriginal?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'El número de motor no puede superar 50 caracteres' })
  nroMotorOriginal?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'El color no puede superar 30 caracteres' })
  color?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(MOTIVOS_VALIDOS, {
    message:
      'motivoAsignacion debe ser ESTANDAR, SIN_NUMERO_ORIGINAL, ILEGIBLE o INACCESIBLE',
  })
  motivoAsignacion?: MotivoAsignacion;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Las observaciones no pueden superar 255 caracteres' })
  observaciones?: string | null;
}