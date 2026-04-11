import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PresenceService } from './presence.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('presence')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('presence')
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  @Get('online')
  @ApiOperation({ summary: 'Listar alunos online no momento' })
  @ApiResponse({ status: 200, description: 'Lista de alunos com presença ativa no Redis' })
  @ApiResponse({ status: 401, description: 'Token inválido ou ausente' })
  getOnlineStudents() {
    return this.presenceService.getOnlineStudents();
  }
}
