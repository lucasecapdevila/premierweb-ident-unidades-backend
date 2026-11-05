import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class FilterStockDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([13, 14], { message: 'El rubro debe ser 13 o 14' })
  rubro?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  soloConStock?: boolean;
}