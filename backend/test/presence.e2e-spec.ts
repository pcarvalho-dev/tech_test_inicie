import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { PresenceModule } from '../src/presence/presence.module';
import { AuthModule } from '../src/auth/auth.module';
import { UsersModule } from '../src/users/users.module';
import { MqttModule } from '../src/mqtt/mqtt.module';
import { ConfigModule } from '@nestjs/config';
import { User, UserRole } from '../src/users/user.entity';

vi.mock('ioredis', () => ({
  default: class {
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue('OK');
    keys = vi.fn().mockResolvedValue(['presence:aluno-uuid']);
    mget = vi.fn().mockResolvedValue([
      JSON.stringify({ userId: 'aluno-uuid', name: 'Aluno', role: 'aluno' }),
    ]);
    exists = vi.fn().mockResolvedValue(1);
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

const mockUserProf = {
  id: 'prof-uuid',
  email: 'prof@test.com',
  name: 'Professor',
  role: UserRole.PROFESSOR,
};

const mockUserRepo = { findOne: vi.fn().mockResolvedValue(mockUserProf), create: vi.fn(), save: vi.fn() };

describe('Presence (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '../.env' }),
        AuthModule,
        UsersModule,
        MqttModule,
        PresenceModule,
      ],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(mockUserRepo)
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

  describe('GET /api/presence/online', () => {
    it('200 retorna alunos online', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/presence/online')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty('name', 'Aluno');
    });

    it('401 sem token', async () => {
      const res = await request(app.getHttpServer()).get('/api/presence/online');
      expect(res.status).toBe(401);
    });
  });
});
