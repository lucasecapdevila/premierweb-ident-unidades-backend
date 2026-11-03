import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import type { MotivoAsignacion } from '../../common/types/index.js';

const MOTIVOS_VALIDOS: MotivoAsignacion[] = [
  'ESTANDAR',
  'SIN_NUMERO_ORIGINAL',
  'ILEGIBLE',
  'INACCESIBLE',
];

export class CreateIdentificacionDto {
  @Type(() => Number)
  @IsInt({ message: 'articuloId debe ser un número entero' })
  @IsPositive({ message: 'articuloId debe ser un ID válido' })
  @IsNotEmpty({ message: 'El artículo es obligatorio' })
  articuloId!: number;

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
  motivoAsignacion?: MotivoAsignacion = 'ESTANDAR';

  @IsOptional()
  @IsString()
  @MaxLength(255, {
    message: 'Las observaciones no pueden superar 255 caracteres',
  })
  observaciones?: string;
}
