import { IsOptional, IsString, MaxLength } from 'class-validator';

export class VenderIdentificacionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, {
    message: 'Las observaciones no pueden superar los 255 caracteres',
  })
  observaciones?: string;
}