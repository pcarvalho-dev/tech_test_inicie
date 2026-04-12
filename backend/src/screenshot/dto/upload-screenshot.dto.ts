import { IsString, IsUUID, MaxLength } from 'class-validator';

const MAX_BASE64_LENGTH = Math.ceil(10 * 1024 * 1024 * (4 / 3));

export class UploadScreenshotDto {
  @IsUUID()
  requestId: string;

  @IsUUID()
  professorId: string;

  @IsString()
  @MaxLength(MAX_BASE64_LENGTH)
  imageBase64: string;
}
