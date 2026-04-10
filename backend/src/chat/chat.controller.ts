import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('send')
  send(@Request() req, @Body() dto: SendMessageDto) {
    return this.chatService.sendMessage(req.user, dto.receiverId, dto.content);
  }

  @Get('history/:userId')
  getHistory(@Request() req, @Param('userId') userId: string) {
    return this.chatService.getHistory(req.user.id, userId);
  }
}
