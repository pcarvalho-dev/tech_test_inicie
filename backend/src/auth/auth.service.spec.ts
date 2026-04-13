import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user.entity';

vi.mock('bcrypt');

const mockRedis = {
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1),
  on: vi.fn(),
};

vi.mock('ioredis', () => ({
  default: class { constructor() { return mockRedis; } },
}));

const mockUser = {
  id: 'uuid-1',
  email: 'prof@test.com',
  name: 'Professor',
  password: 'hashed',
  role: UserRole.PROFESSOR,
};

const mockUsersService = { findByEmail: vi.fn(), create: vi.fn(), findById: vi.fn() };
const mockJwtService = { sign: vi.fn().mockReturnValue('token-jwt') };
const mockConfig = {
  getOrThrow: vi.fn((key: string) => {
    const map: Record<string, string> = { REDIS_HOST: 'localhost', JWT_EXPIRES_IN: '8h' };
    return map[key];
  }),
  get: vi.fn((key: string) => {
    const map: Record<string, unknown> = { REDIS_PORT: 6379 };
    return map[key];
  }),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedis.set.mockResolvedValue('OK');
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).setLogger(false).compile();

    service = module.get(AuthService);
    service.onModuleInit();
  });

  describe('register', () => {
    it('cria usuário e retorna token', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as never);
      mockUsersService.create.mockResolvedValue(mockUser);

      const result = await service.register({
        email: 'prof@test.com',
        name: 'Professor',
        password: '123456',
        role: UserRole.PROFESSOR,
      });

      expect(result.access_token).toBe('token-jwt');
      expect(result.user.email).toBe('prof@test.com');
      expect(result.user).not.toHaveProperty('password');
    });

    it('propaga ConflictException do usersService', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as never);
      mockUsersService.create.mockRejectedValue(new ConflictException());

      await expect(
        service.register({ email: 'x@x.com', name: 'X', password: '123456', role: UserRole.ALUNO }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('retorna token com credenciais válidas', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await service.login({ email: 'prof@test.com', password: '123456' });

      expect(result.access_token).toBe('token-jwt');
      expect(result.user.id).toBe('uuid-1');
    });

    it('lança UnauthorizedException se email não encontrado', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nao@existe.com', password: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lança UnauthorizedException se senha inválida', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        service.login({ email: 'prof@test.com', password: 'errada' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('onModuleInit — error handler Redis', () => {
    it('trata erro do Redis sem lançar exceção', () => {
      const errorHandler = mockRedis.on.mock.calls.find(([evt]: [string]) => evt === 'error')?.[1];
      expect(() => errorHandler?.(new Error('redis down'))).not.toThrow();
    });
  });

  describe('getSession', () => {
    it('retorna null se não há sessão em cache', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.getSession('uuid-1');
      expect(result).toBeNull();
    });

    it('retorna dados da sessão se existir no cache', async () => {
      const session = { id: 'uuid-1', email: 'a@a.com', name: 'A', role: 'aluno' };
      mockRedis.get.mockResolvedValue(JSON.stringify(session));

      const result = await service.getSession('uuid-1');
      expect(result).toEqual(session);
    });
  });

  describe('invalidateSession', () => {
    it('remove a sessão do Redis', async () => {
      mockRedis.del.mockResolvedValue(1);
      await service.invalidateSession('uuid-1');
      expect(mockRedis.del).toHaveBeenCalledWith('session:uuid-1');
    });
  });

  describe('parseJwtExpiry — formato inválido', () => {
    it('usa TTL padrão de 28800s quando formato não reconhecido', async () => {
      const configInvalid = {
        getOrThrow: vi.fn((key: string) => {
          if (key === 'REDIS_HOST') return 'localhost';
          if (key === 'JWT_EXPIRES_IN') return 'sem-formato';
          return undefined;
        }),
        get: vi.fn().mockReturnValue(6379),
      };

      const module2 = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: UsersService, useValue: mockUsersService },
          { provide: JwtService, useValue: mockJwtService },
          { provide: ConfigService, useValue: configInvalid },
        ],
      }).setLogger(false).compile();

      const svc = module2.get(AuthService);
      expect(() => svc.onModuleInit()).not.toThrow();
    });
  });
});
