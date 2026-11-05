import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  SUCURSALES_IDS,
  type EstadoIdentificacion,
  type SucursalId,
} from '../../common/index.js';

const ESTADOS_VALIDOS: EstadoIdentificacion[] = [
  'ACTIVO',
  'ANULADO',
  'VENDIDA',
];

export class FilterIdentificacionesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(ESTADOS_VALIDOS, {
    message: 'El filtro estado debe ser ACTIVO, ANULADO o VENDIDA',
  })
  estado?: EstadoIdentificacion;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  codart?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sucursalId debe ser un número entero' })
  @IsIn(SUCURSALES_IDS, {
    message: 'El filtro sucursalId debe ser 1, 2, 3 o 9',
  })
  sucursalId?: SucursalId;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate debe tener el formato YYYY-MM-DD',
  })
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate debe tener el formato YYYY-MM-DD',
  })
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
