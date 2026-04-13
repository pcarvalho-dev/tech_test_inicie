import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MqttAuthController } from './mqtt-auth.controller';

const mockConfig = {
  getOrThrow: vi.fn().mockReturnValue('mqtt_secret_password'),
};

const mockJwtService = {
  verify: vi.fn(),
};

describe('MqttAuthController', () => {
  let controller: MqttAuthController;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConfig.getOrThrow.mockReturnValue('mqtt_secret_password');

    const module = await Test.createTestingModule({
      controllers: [MqttAuthController],
      providers: [
        { provide: ConfigService, useValue: mockConfig },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).setLogger(false).compile();

    controller = module.get(MqttAuthController);
  });

  describe('auth', () => {
    it('permite backend com credenciais corretas', () => {
      const result = controller.auth({ username: 'backend', password: 'mqtt_secret_password' });
      expect(result).toEqual({ result: 'allow' });
    });

    it('nega backend com senha errada', () => {
      const result = controller.auth({ username: 'backend', password: 'senha_errada' });
      expect(result).toEqual({ result: 'deny' });
    });

    it('permite usuário com JWT válido onde sub coincide com username', () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-uuid' });
      const result = controller.auth({ username: 'user-uuid', password: 'jwt.token.aqui' });
      expect(result).toEqual({ result: 'allow' });
    });

    it('nega usuário quando sub do JWT não coincide com username', () => {
      mockJwtService.verify.mockReturnValue({ sub: 'outro-uuid' });
      const result = controller.auth({ username: 'user-uuid', password: 'jwt.token.aqui' });
      expect(result).toEqual({ result: 'deny' });
    });

    it('nega quando JWT é inválido ou expirado', () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('jwt expired'); });
      const result = controller.auth({ username: 'user-uuid', password: 'token.invalido' });
      expect(result).toEqual({ result: 'deny' });
    });
  });
});
