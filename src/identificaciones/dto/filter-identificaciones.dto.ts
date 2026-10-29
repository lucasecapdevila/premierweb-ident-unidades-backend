import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
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