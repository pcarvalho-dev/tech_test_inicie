import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user.entity';

const mockUsersService = { findById: vi.fn() };
const mockConfigService = { getOrThrow: vi.fn().mockReturnValue('secret') };

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: UsersService, useValue: mockUsersService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  it('retorna o usuário se encontrado', async () => {
    const user = { id: 'uuid-1', email: 'a@a.com', role: UserRole.ALUNO };
    mockUsersService.findById.mockResolvedValue(user);

    const result = await strategy.validate({ sub: 'uuid-1', email: 'a@a.com', role: UserRole.ALUNO });

    expect(result).toEqual(user);
  });

  it('lança UnauthorizedException se usuário não existe', async () => {
    mockUsersService.findById.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'nao-existe', email: 'x@x.com', role: UserRole.ALUNO }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
