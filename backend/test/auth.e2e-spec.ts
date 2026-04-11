import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../src/auth/auth.module';
import { UsersModule } from '../src/users/users.module';
import { User, UserRole } from '../src/users/user.entity';

const mockUser = {
  id: 'uuid-1',
  email: 'prof@test.com',
  name: 'Professor',
  password: '$2b$12$hashedpassword',
  role: UserRole.PROFESSOR,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRepo = { findOne: vi.fn(), create: vi.fn(), save: vi.fn() };

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env' }),
        AuthModule,
        UsersModule,
      ],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(mockRepo)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  }, 15000);

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('201 com dados válidos', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue(mockUser);
      mockRepo.save.mockResolvedValue(mockUser);

      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'prof@test.com', name: 'Professor', password: '123456', role: 'professor' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('access_token');
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('400 com email inválido', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'nao-e-email', name: 'X', password: '123456', role: 'professor' });

      expect(res.status).toBe(400);
    });

    it('400 com role inválido', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'a@a.com', name: 'X', password: '123456', role: 'admin' });

      expect(res.status).toBe(400);
    });

    it('400 com senha curta', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'a@a.com', name: 'X', password: '123', role: 'professor' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('200 com credenciais válidas', async () => {
      const bcrypt = await import('bcrypt');
      const hashed = await bcrypt.hash('123456', 12);
      mockRepo.findOne.mockResolvedValue({ ...mockUser, password: hashed });

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'prof@test.com', password: '123456' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('access_token');
    });

    it('401 com email inexistente', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nao@existe.com', password: '123456' });

      expect(res.status).toBe(401);
    });

    it('401 com senha errada', async () => {
      const bcrypt = await import('bcrypt');
      const hashed = await bcrypt.hash('correta', 12);
      mockRepo.findOne.mockResolvedValue({ ...mockUser, password: hashed });

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'prof@test.com', password: 'errada' });

      expect(res.status).toBe(401);
    });

    it('400 com body vazio', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
