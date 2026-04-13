import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const mockUsersService = { search: vi.fn(), findByRole: vi.fn() };

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .setLogger(false)
      .compile();

    controller = module.get(UsersController);
  });

  it('retorna resultados da busca quando q tem 2+ caracteres', async () => {
    const users = [{ id: 'uuid-1', name: 'Professor', email: 'prof@test.com', role: 'professor' }];
    mockUsersService.search.mockResolvedValue(users);

    const result = await controller.search('pro');
    expect(mockUsersService.search).toHaveBeenCalledWith('pro');
    expect(result).toEqual(users);
  });

  it('retorna array vazio sem chamar service quando q é muito curto', async () => {
    const result = await controller.search('a');
    expect(mockUsersService.search).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('retorna array vazio sem chamar service quando q é undefined', async () => {
    const result = await controller.search(undefined as unknown as string);
    expect(mockUsersService.search).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('findProfessors delega para service com role PROFESSOR', async () => {
    const professors = [{ id: 'uuid-1', name: 'Prof', email: 'prof@test.com', role: 'professor' }];
    mockUsersService.findByRole.mockResolvedValue(professors);

    const result = await controller.findProfessors();
    expect(result).toEqual(professors);
  });

  it('findAlunos delega para service com role ALUNO', async () => {
    const alunos = [{ id: 'uuid-2', name: 'Aluno', email: 'aluno@test.com', role: 'aluno' }];
    mockUsersService.findByRole.mockResolvedValue(alunos);

    const result = await controller.findAlunos();
    expect(result).toEqual(alunos);
  });
});
