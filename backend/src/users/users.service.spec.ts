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

const mockQb = {
  select: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  andWhere: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  take: vi.fn().mockReturnThis(),
  getMany: vi.fn(),
};

const mockRepo = {
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  createQueryBuilder: vi.fn().mockReturnValue(mockQb),
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
      mockRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockRepo.findOne.mockResolvedValue(mockUser);

      await expect(
        service.create({ email: 'test@test.com', name: 'Test', password: 'hashed', role: UserRole.ALUNO }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('search', () => {
    it('retorna usuários que correspondem ao termo', async () => {
      mockQb.getMany.mockResolvedValue([mockUser]);
      const result = await service.search('test');
      expect(result).toEqual([mockUser]);
      expect(mockQb.where).toHaveBeenCalledWith(expect.stringContaining('LIKE'), expect.objectContaining({ q: '%test%' }));
    });

    it('retorna array vazio para query vazia', async () => {
      mockQb.getMany.mockResolvedValue([]);
      const result = await service.search('');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findByRole', () => {
    it('retorna usuários pelo role', async () => {
      const professors = [{ id: 'uuid-1', name: 'Prof', email: 'prof@test.com', role: UserRole.PROFESSOR }];
      mockQb.getMany.mockResolvedValue(professors);

      const result = await service.findByRole(UserRole.PROFESSOR);
      expect(result).toEqual(professors);
      expect(mockQb.where).toHaveBeenCalledWith('u.role = :role', { role: UserRole.PROFESSOR });
    });
  });
});
