import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user.entity';

vi.mock('bcrypt');

const mockUser = {
  id: 'uuid-1',
  email: 'prof@test.com',
  name: 'Professor',
  password: 'hashed',
  role: UserRole.PROFESSOR,
};

const mockUsersService = { findByEmail: vi.fn(), create: vi.fn(), findById: vi.fn() };
const mockJwtService = { sign: vi.fn().mockReturnValue('token-jwt') };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get(AuthService);
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
});
