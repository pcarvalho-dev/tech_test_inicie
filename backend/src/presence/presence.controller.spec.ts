import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const mockPresenceService = { getOnlineUsers: vi.fn(), pingFromHttp: vi.fn() };

describe('PresenceController', () => {
  let controller: PresenceController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PresenceController],
      providers: [{ provide: PresenceService, useValue: mockPresenceService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PresenceController);
  });

  it('retorna usuários online', async () => {
    const users = [{ userId: 'uuid-1', name: 'Aluno', role: 'aluno' }];
    mockPresenceService.getOnlineUsers.mockResolvedValue(users);

    const result = await controller.getOnlineUsers();
    expect(result).toEqual(users);
  });

  it('ping delega para pingFromHttp com dados do usuário autenticado', async () => {
    mockPresenceService.pingFromHttp.mockResolvedValue(undefined);
    const req = { user: { id: 'uuid-1', name: 'Aluno', role: 'aluno' } };

    await controller.ping(req);

    expect(mockPresenceService.pingFromHttp).toHaveBeenCalledWith('uuid-1', 'Aluno', 'aluno');
  });
});
