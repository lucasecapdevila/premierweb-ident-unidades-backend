import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'El usuario es obligatorio' })
  @MaxLength(20)
  usuario!: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MaxLength(15)
  contrasena!: string;
}
