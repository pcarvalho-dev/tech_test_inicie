import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({ ...dto, password: hashed });

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      access_token: this.generateToken(user.id, user.email, user.role),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      access_token: this.generateToken(user.id, user.email, user.role),
    };
  }

  private generateToken(sub: string, email: string, role: string) {
    return this.jwtService.sign({ sub, email, role });
  }
}
