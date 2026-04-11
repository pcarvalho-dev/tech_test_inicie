import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/user.entity';

export class RegisterDto {
  @ApiProperty({ example: 'professor@escola.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'senha123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.PROFESSOR })
  @IsEnum(UserRole)
  role!: UserRole;
}
