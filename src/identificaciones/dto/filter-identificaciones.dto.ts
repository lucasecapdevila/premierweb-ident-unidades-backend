// backend/src/identificaciones/dto/filter-identificaciones.dto.ts
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { EstadoIdentificacion } from '../../common/types/index.js';

export class FilterIdentificacionesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVO', 'ANULADO'], {
    message: 'El estado debe ser ACTIVO o ANULADO',
  })
  estado?: EstadoIdentificacion;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  codart?: number;

  @IsOptional()
  @IsDateString({}, { message: 'startDate debe tener un formato de fecha válido (YYYY-MM-DD)' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endDate debe tener un formato de fecha válido (YYYY-MM-DD)' })
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