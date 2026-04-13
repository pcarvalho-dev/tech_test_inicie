import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './users/user.entity';

const SEED_USERS = [
  {
    name: 'Professor Teste',
    email: 'professor@teste.com',
    password: '123456',
    role: UserRole.PROFESSOR,
  },
  {
    name: 'Aluno Teste',
    email: 'aluno@teste.com',
    password: '123456',
    role: UserRole.ALUNO,
  },
];

export async function seed(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(User);

  for (const data of SEED_USERS) {
    const exists = await repo.findOne({ where: { email: data.email } });
    if (exists) continue;

    const hashed = await bcrypt.hash(data.password, 12);
    await repo.save(repo.create({ ...data, password: hashed }));
  }
}
