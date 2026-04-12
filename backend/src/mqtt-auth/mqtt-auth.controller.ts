import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

interface MqttAuthBody {
  username: string;
  password: string;
}

@Controller('mqtt')
export class MqttAuthController {
  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('auth')
  @HttpCode(200)
  auth(@Body() body: MqttAuthBody): { result: 'allow' | 'deny' } {
    const { username, password } = body;

    if (
      username === 'backend' &&
      password === this.config.getOrThrow<string>('MQTT_PASSWORD')
    ) {
      return { result: 'allow' };
    }

    try {
      const payload = this.jwtService.verify<{ sub: string }>(password);
      if (payload?.sub === username) {
        return { result: 'allow' };
      }
    } catch {
      // token inválido
    }

    return { result: 'deny' };
  }
}
