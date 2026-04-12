import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserRole } from '../users/user.entity';

const mockChatService = { sendMessage: vi.fn(), getHistory: vi.fn() };

const mockReq = {
  user: { id: 'uuid-1', email: 'a@a.com', role: UserRole.PROFESSOR },
};

describe('ChatController', () => {
  let controller: ChatController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: mockChatService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ChatController);
  });

  it('send delega para ChatService com user e dto', async () => {
    mockChatService.sendMessage.mockResolvedValue({});
    await controller.send(mockReq, { receiverId: 'recv-uuid', content: 'oi' });
    expect(mockChatService.sendMessage).toHaveBeenCalledWith(mockReq.user, 'recv-uuid', 'oi');
  });

  it('getHistory com limit e cursor padrão', async () => {
    mockChatService.getHistory.mockResolvedValue({ data: [], hasMore: false, nextCursor: null });
    await controller.getHistory(mockReq, 'other-uuid');
    expect(mockChatService.getHistory).toHaveBeenCalledWith('uuid-1', 'other-uuid', 50, undefined);
  });

  it('getHistory converte limit string para número', async () => {
    mockChatService.getHistory.mockResolvedValue({ data: [], hasMore: false, nextCursor: null });
    await controller.getHistory(mockReq, 'other-uuid', '20', '2026-01-01T00:00:00.000Z');
    expect(mockChatService.getHistory).toHaveBeenCalledWith('uuid-1', 'other-uuid', 20, '2026-01-01T00:00:00.000Z');
  });

  it('getHistory usa limit 50 quando valor não é numérico', async () => {
    mockChatService.getHistory.mockResolvedValue({ data: [], hasMore: false, nextCursor: null });
    await controller.getHistory(mockReq, 'other-uuid', 'abc');
    expect(mockChatService.getHistory).toHaveBeenCalledWith('uuid-1', 'other-uuid', 50, undefined);
  });
});
