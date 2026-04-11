import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRole } from '../users/user.entity';

const mockAuthService = { register: vi.fn(), login: vi.fn() };

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get(AuthController);
  });

  it('register delega para AuthService', async () => {
    const dto = { email: 'a@a.com', name: 'A', password: '123456', role: UserRole.ALUNO };
    mockAuthService.register.mockResolvedValue({ user: {}, access_token: 'tok' });

    await controller.register(dto);

    expect(mockAuthService.register).toHaveBeenCalledWith(dto);
  });

  it('login delega para AuthService', async () => {
    const dto = { email: 'a@a.com', password: '123456' };
    mockAuthService.login.mockResolvedValue({ user: {}, access_token: 'tok' });

    await controller.login(dto);

    expect(mockAuthService.login).toHaveBeenCalledWith(dto);
  });
});
