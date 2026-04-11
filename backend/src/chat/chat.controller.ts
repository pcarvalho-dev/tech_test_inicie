import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('send')
  @ApiOperation({ summary: 'Enviar mensagem para outro usuário' })
  @ApiResponse({ status: 201, description: 'Mensagem enviada e publicada via MQTT' })
  @ApiResponse({ status: 401, description: 'Token inválido ou ausente' })
  send(@Request() req, @Body() dto: SendMessageDto) {
    return this.chatService.sendMessage(req.user, dto.receiverId, dto.content);
  }

  @Get('history/:userId')
  @ApiOperation({ summary: 'Buscar histórico de mensagens com outro usuário' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'cursor', required: false, description: 'ISO8601 — busca mensagens anteriores a esta data' })
  @ApiResponse({ status: 200, description: 'Lista paginada de mensagens com hasMore e nextCursor' })
  @ApiResponse({ status: 401, description: 'Token inválido ou ausente' })
  getHistory(
    @Request() req,
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.chatService.getHistory(req.user.id, userId, limit ? parseInt(limit) : 50, cursor);
  }
}
