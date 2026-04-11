import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ChatModule } from '../src/chat/chat.module';
import { AuthModule } from '../src/auth/auth.module';
import { UsersModule } from '../src/users/users.module';
import { MqttModule } from '../src/mqtt/mqtt.module';
import { ConfigModule } from '@nestjs/config';
import { User, UserRole } from '../src/users/user.entity';
import { Message } from '../src/chat/message.entity';

vi.mock('ioredis', () => ({
  default: class {
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue('OK');
    del = vi.fn().mockResolvedValue(1);
    keys = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock('mqtt', () => ({
  connect: vi.fn(() => ({
    on: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    end: vi.fn(),
  })),
}));

const mockUserRepo = { findOne: vi.fn(), create: vi.fn(), save: vi.fn() };
const mockMessageRepo = {
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  createQueryBuilder: vi.fn(),
};

const mockMessage = {
  id: 'msg-uuid',
  senderId: 'prof-uuid',
  receiverId: 'aluno-uuid',
  content: 'Olá!',
  createdAt: new Date(),
};

const mockUserProf = {
  id: 'prof-uuid',
  email: 'prof@test.com',
  name: 'Professor',
  password: 'hashed',
  role: UserRole.PROFESSOR,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Chat (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env' }),
        AuthModule,
        UsersModule,
        MqttModule,
        ChatModule,
      ],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(mockUserRepo)
      .overrideProvider(getRepositoryToken(Message))
      .useValue(mockMessageRepo)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    const jwtService = module.get(JwtService);
    token = jwtService.sign({ sub: 'prof-uuid', email: 'prof@test.com', role: UserRole.PROFESSOR });
    mockUserRepo.findOne.mockResolvedValue(mockUserProf);
  }, 15000);

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/chat/send', () => {
    it('201 envia mensagem com token válido', async () => {
      mockMessageRepo.create.mockReturnValue(mockMessage);
      mockMessageRepo.save.mockResolvedValue(mockMessage);

      const res = await request(app.getHttpServer())
        .post('/api/chat/send')
        .set('Authorization', `Bearer ${token}`)
        .send({ receiverId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', content: 'Olá!' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('401 sem token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/chat/send')
        .send({ receiverId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', content: 'Olá!' });

      expect(res.status).toBe(401);
    });

    it('400 com receiverId inválido', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/chat/send')
        .set('Authorization', `Bearer ${token}`)
        .send({ receiverId: 'nao-e-uuid', content: 'Olá!' });

      expect(res.status).toBe(400);
    });

    it('400 com content vazio', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/chat/send')
        .set('Authorization', `Bearer ${token}`)
        .send({ receiverId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', content: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/chat/history/:userId', () => {
    it('200 retorna histórico paginado', async () => {
      mockMessageRepo.createQueryBuilder.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([mockMessage]),
      });

      const res = await request(app.getHttpServer())
        .get('/api/chat/history/aluno-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('hasMore');
      expect(res.body).toHaveProperty('nextCursor');
    });

    it('401 sem token', async () => {
      const res = await request(app.getHttpServer()).get('/api/chat/history/aluno-uuid');
      expect(res.status).toBe(401);
    });
  });
});
