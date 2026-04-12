import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ScreenshotModule } from '../src/screenshot/screenshot.module';
import { AuthModule } from '../src/auth/auth.module';
import { UsersModule } from '../src/users/users.module';
import { MqttModule } from '../src/mqtt/mqtt.module';
import { ConfigModule } from '@nestjs/config';
import { User, UserRole } from '../src/users/user.entity';
import { Screenshot } from '../src/screenshot/screenshot.entity';

vi.mock('ioredis', () => ({
  default: class {
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue('OK');
    del = vi.fn().mockResolvedValue(1);
    on = vi.fn();
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

vi.mock('fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));
vi.mock('fs', () => ({ existsSync: vi.fn().mockReturnValue(true), mkdirSync: vi.fn() }));

const mockUserProf = {
  id: 'prof-uuid',
  email: 'prof@test.com',
  name: 'Professor',
  role: UserRole.PROFESSOR,
};

const mockScreenshot = {
  id: 'ss-uuid',
  professorId: 'prof-uuid',
  alunoId: 'aluno-uuid',
  filePath: 'screenshot.png',
  createdAt: new Date(),
};

const mockUserRepo = { findOne: vi.fn().mockResolvedValue(mockUserProf), create: vi.fn(), save: vi.fn() };
const mockScreenshotRepo = {
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  createQueryBuilder: vi.fn(),
};

describe('Screenshots (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env' }),
        AuthModule,
        UsersModule,
        MqttModule,
        ScreenshotModule,
      ],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(mockUserRepo)
      .overrideProvider(getRepositoryToken(Screenshot))
      .useValue(mockScreenshotRepo)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    const jwtService = module.get(JwtService);
    token = jwtService.sign({ sub: 'prof-uuid', email: 'prof@test.com', role: UserRole.PROFESSOR });
  }, 15000);

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/screenshots/request/:alunoId', () => {
    it('201 retorna requestId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/screenshots/request/aluno-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('requestId');
    });

    it('401 sem token', async () => {
      const res = await request(app.getHttpServer()).post('/api/screenshots/request/aluno-uuid');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/screenshots/history', () => {
    it('200 retorna lista de screenshots', async () => {
      mockScreenshotRepo.createQueryBuilder.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([mockScreenshot]),
      });

      const res = await request(app.getHttpServer())
        .get('/api/screenshots/history')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('401 sem token', async () => {
      const res = await request(app.getHttpServer()).get('/api/screenshots/history');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/screenshots/:id/image', () => {
    it('404 quando screenshot não existe', async () => {
      mockScreenshotRepo.findOne.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/screenshots/nao-existe/image')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('401 sem token', async () => {
      const res = await request(app.getHttpServer()).get('/api/screenshots/ss-uuid/image');
      expect(res.status).toBe(401);
    });
  });
});
