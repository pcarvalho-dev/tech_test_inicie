import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UserRole } from './user.entity';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('professors')
  @ApiOperation({ summary: 'Listar todos os professores cadastrados' })
  @ApiResponse({ status: 200, description: 'Lista de professores (sem password)' })
  @ApiResponse({ status: 401, description: 'Token inválido ou ausente' })
  findProfessors() {
    return this.usersService.findByRole(UserRole.PROFESSOR);
  }

  @Get('alunos')
  @ApiOperation({ summary: 'Listar todos os alunos cadastrados' })
  @ApiResponse({ status: 200, description: 'Lista de alunos (sem password)' })
  @ApiResponse({ status: 401, description: 'Token inválido ou ausente' })
  findAlunos() {
    return this.usersService.findByRole(UserRole.ALUNO);
  }

  @Get('search')
  @ApiOperation({ summary: 'Buscar usuários por nome ou email' })
  @ApiQuery({ name: 'q', description: 'Termo de busca (nome ou email)' })
  @ApiResponse({ status: 200, description: 'Lista de usuários encontrados (sem password)' })
  @ApiResponse({ status: 401, description: 'Token inválido ou ausente' })
  search(@Query('q') q: string) {
    if (!q || q.trim().length < 2) return [];
    return this.usersService.search(q.trim());
  }
}
