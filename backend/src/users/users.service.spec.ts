import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersService } from './users.service';
import { User, UserRole } from './user.entity';

const mockUser: User = {
  id: 'uuid-1',
  email: 'test@test.com',
  name: 'Test User',
  password: 'hashed',
  role: UserRole.ALUNO,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRepo = {
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findByEmail', () => {
    it('retorna usuário se encontrado', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);
      const result = await service.findByEmail('test@test.com');
      expect(result).toEqual(mockUser);
    });

    it('retorna null se não encontrado', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.findByEmail('nao@existe.com');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('retorna usuário pelo id', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);
      const result = await service.findById('uuid-1');
      expect(result).toEqual(mockUser);
    });

    it('retorna null se não encontrado', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.findById('nao-existe');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('cria e retorna o usuário', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue(mockUser);
      mockRepo.save.mockResolvedValue(mockUser);

      const result = await service.create({
        email: 'test@test.com',
        name: 'Test',
        password: 'hashed',
        role: UserRole.ALUNO,
      });

      expect(result).toEqual(mockUser);
      expect(mockRepo.save).toHaveBeenCalledWith(mockUser);
    });

    it('lança ConflictException se email já existe', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);

      await expect(
        service.create({ email: 'test@test.com', name: 'Test', password: 'hashed', role: UserRole.ALUNO }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
