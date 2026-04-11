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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScreenshotService } from './screenshot.service';

@UseGuards(JwtAuthGuard)
@Controller('screenshots')
export class ScreenshotController {
  constructor(private readonly screenshotService: ScreenshotService) {}

  @Post('request/:alunoId')
  requestScreenshot(@Request() req: any, @Param('alunoId') alunoId: string) {
    return this.screenshotService.requestScreenshot(req.user.id, alunoId);
  }

  @Get('history')
  getHistory(@Request() req: any, @Query('alunoId') alunoId?: string) {
    return this.screenshotService.getHistory(req.user.id, alunoId);
  }

  @Get(':id/image')
  async getImage(@Param('id') id: string, @Res() res: any) {
    const screenshot = await this.screenshotService.getImagePath(id);
    if (!screenshot?.filePath) throw new NotFoundException('Screenshot not found');
    res.sendFile(screenshot.filePath, { root: '.' });
  }
}
