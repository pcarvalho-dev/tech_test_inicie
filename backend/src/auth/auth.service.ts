import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const SESSION_PREFIX = 'session:';

export interface SessionData {
  id: string;
  email: string;
  name: string;
  role: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private redis: Redis;
  private sessionTtl: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.redis = new Redis({
      host: this.config.getOrThrow<string>('REDIS_HOST'),
      port: this.config.get<number>('REDIS_PORT') ?? 6379,
    });
    this.redis.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
    this.sessionTtl = this.parseJwtExpiry(this.config.getOrThrow<string>('JWT_EXPIRES_IN'));
  }

  async register(dto: RegisterDto) {
    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({ ...dto, password: hashed });

    const session: SessionData = { id: user.id, email: user.email, name: user.name, role: user.role };
    await this.cacheSession(user.id, session);

    return { user: session, access_token: this.generateToken(user.id, user.email, user.role) };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');

    const session: SessionData = { id: user.id, email: user.email, name: user.name, role: user.role };
    await this.cacheSession(user.id, session);

    return { user: session, access_token: this.generateToken(user.id, user.email, user.role) };
  }

  async getSession(userId: string): Promise<SessionData | null> {
    const data = await this.redis.get(`${SESSION_PREFIX}${userId}`);
    return data ? (JSON.parse(data) as SessionData) : null;
  }

  async invalidateSession(userId: string): Promise<void> {
    await this.redis.del(`${SESSION_PREFIX}${userId}`);
  }

  private async cacheSession(userId: string, session: SessionData): Promise<void> {
    await this.redis.set(`${SESSION_PREFIX}${userId}`, JSON.stringify(session), 'EX', this.sessionTtl);
  }

  private generateToken(sub: string, email: string, role: string) {
    return this.jwtService.sign({ sub, email, role });
  }

  private parseJwtExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 28800;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * multipliers[unit];
  }
}
