import { IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: 'uuid-do-aluno' })
  @IsUUID()
  receiverId!: string;

  @ApiProperty({ example: 'Olá, tudo bem?' })
  @IsString()
  @MinLength(1)
  content!: string;
}
