import { Controller, Get, Post, HttpCode, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PresenceService } from './presence.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('presence')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('presence')
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  @Post('ping')
  @HttpCode(204)
  @ApiOperation({ summary: 'Atualizar presença via HTTP (usado pelo service worker MV3)' })
  @ApiResponse({ status: 204, description: 'Presença atualizada no Redis e publicada no MQTT' })
  @ApiResponse({ status: 401, description: 'Token inválido ou ausente' })
  async ping(@Request() req: any) {
    await this.presenceService.pingFromHttp(req.user.id, req.user.name, req.user.role);
  }

  @Get('online')
  @ApiOperation({ summary: 'Listar alunos online no momento' })
  @ApiResponse({ status: 200, description: 'Lista de alunos com presença ativa no Redis' })
  @ApiResponse({ status: 401, description: 'Token inválido ou ausente' })
  getOnlineStudents() {
    return this.presenceService.getOnlineStudents();
  }
}
