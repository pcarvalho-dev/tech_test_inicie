import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const mockPresenceService = { getOnlineStudents: vi.fn() };

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

  it('retorna alunos online', async () => {
    const alunos = [{ userId: 'uuid-1', name: 'Aluno' }];
    mockPresenceService.getOnlineStudents.mockResolvedValue(alunos);

    const result = await controller.getOnlineStudents();
    expect(result).toEqual(alunos);
  });
});
