import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
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

export class CreateBulkIdentificacionDto {
  @Type(() => Number)
  @IsInt({ message: 'articuloId debe ser un número entero' })
  @IsPositive({ message: 'articuloId debe ser un ID válido' })
  @IsNotEmpty({ message: 'El artículo es obligatorio' })
  articuloId!: number;

  @Type(() => Number)
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(2, {
    message: 'Para alta masiva la cantidad mínima es de 2 unidades',
  })
  @Max(100, {
    message: 'Por seguridad operativa el máximo por lote es de 100 unidades',
  })
  @IsNotEmpty({ message: 'La cantidad de unidades es obligatoria' })
  cantidad!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sucursalId debe ser un número entero' })
  @IsIn(SUCURSALES_IDS, {
    message: 'sucursalId debe ser una sucursal válida (1, 2, 3 o 9)',
  })
  sucursalId?: SucursalId = 1;

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