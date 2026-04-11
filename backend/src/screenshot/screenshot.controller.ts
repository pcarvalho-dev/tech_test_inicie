import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScreenshotService } from './screenshot.service';

@ApiTags('screenshots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('screenshots')
export class ScreenshotController {
  constructor(private readonly screenshotService: ScreenshotService) {}

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
    // filePath armazena apenas o filename (sem path), root aponta para o storageDir
    const storageDir = process.env.SCREENSHOT_STORAGE_DIR ?? './screenshots';
    res.sendFile(screenshot.filePath, { root: storageDir });
  }
}
