import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AnularIdentificacionDto {
  @IsString()
  @IsNotEmpty({ message: 'El motivo de anulación es obligatorio' })
  @MinLength(3, {
    message: 'El motivo de anulación debe tener al menos 3 caracteres',
  })
  @MaxLength(255, {
    message: 'El motivo de anulación no puede superar 255 caracteres',
  })
  motivoAnulacion!: string;
}
