import {
  Controller,
  Post,
  Get,
  HttpCode,
  Param,
  Query,
  Body,
  Res,
  Sse,
  MessageEvent,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScreenshotService } from './screenshot.service';
import { CaptureFailedDto } from './dto/capture-failed.dto';
import { UploadScreenshotDto } from './dto/upload-screenshot.dto';

@ApiTags('screenshots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('screenshots')
export class ScreenshotController {
  constructor(private readonly screenshotService: ScreenshotService) {}

  @Sse('stream')
  @ApiOperation({ summary: 'SSE stream de pedidos de screenshot para o aluno autenticado' })
  getStream(@Request() req: any): Observable<MessageEvent> {
    return this.screenshotService.getStream(req.user.id);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Verificar se há pedido de screenshot pendente para o aluno autenticado' })
  @ApiResponse({ status: 200, description: '{ requestId, professorId } ou null' })
  getPending(@Request() req: any) {
    return this.screenshotService.getPendingRequest(req.user.id);
  }

  @Post('capture-failed')
  @HttpCode(204)
  @ApiOperation({ summary: 'Notificar professor que captura de screenshot falhou' })
  @ApiResponse({ status: 204 })
  captureFailed(@Body() body: CaptureFailedDto) {
    this.screenshotService.notifyCaptureFailed(body.professorId, body.requestId);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Enviar screenshot capturado via HTTP (usado pelo service worker MV3)' })
  @ApiResponse({ status: 201, description: 'Screenshot salvo e professor notificado via MQTT' })
  @ApiResponse({ status: 401, description: 'Token inválido ou ausente' })
  uploadScreenshot(
    @Request() req: any,
    @Body() body: UploadScreenshotDto,
  ) {
    return this.screenshotService.uploadFromHttp(req.user.id, body);
  }

  @Post('request/:alunoId')
  @ApiOperation({ summary: 'Solicitar screenshot da tela de um aluno' })
  @ApiResponse({ status: 201, description: 'Comando publicado via MQTT, retorna requestId' })
  @ApiResponse({ status: 401, description: 'Token inválido ou ausente' })
  requestScreenshot(@Request() req: any, @Param('alunoId') alunoId: string) {
    return this.screenshotService.requestScreenshot(req.user.id, alunoId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Buscar histórico de screenshots do professor' })
  @ApiQuery({ name: 'alunoId', required: false, description: 'Filtrar por aluno específico' })
  @ApiResponse({ status: 200, description: 'Lista de screenshots com metadados' })
  @ApiResponse({ status: 401, description: 'Token inválido ou ausente' })
  getHistory(@Request() req: any, @Query('alunoId') alunoId?: string) {
    return this.screenshotService.getHistory(req.user.id, alunoId);
  }

  @Get(':id/image')
  @ApiOperation({ summary: 'Baixar imagem de um screenshot pelo ID' })
  @ApiResponse({ status: 200, description: 'Arquivo de imagem PNG' })
  @ApiResponse({ status: 404, description: 'Screenshot não encontrado' })
  async getImage(@Param('id') id: string, @Res() res: any) {
    const screenshot = await this.screenshotService.getImagePath(id);
    if (!screenshot?.filePath) throw new NotFoundException('Screenshot not found');
    const storageDir = process.env.SCREENSHOT_STORAGE_DIR ?? './screenshots';
    res.sendFile(screenshot.filePath, { root: storageDir });
  }
}
