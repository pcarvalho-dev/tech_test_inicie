import { IsString, IsUUID } from 'class-validator';

export class CaptureFailedDto {
  @IsUUID()
  requestId: string;

  @IsUUID()
  professorId: string;
}
