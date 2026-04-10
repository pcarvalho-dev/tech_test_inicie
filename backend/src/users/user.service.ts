import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async create(data: {
    email: string;
    name: string;
    password: string;
    role: UserRole;
  }): Promise<User> {
    const exists = await this.findByEmail(data.email);
    if (exists) throw new ConflictException('Email já cadastrado');

    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }
}
