import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('screenshots')
@Index('IDX_screenshots_professor', ['professorId'])
@Index('IDX_screenshots_aluno', ['alunoId'])
@Index('IDX_screenshots_created', ['createdAt'])
export class Screenshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  professorId!: string;

  @Column({ type: 'uuid' })
  alunoId!: string;

  @Column({ nullable: true })
  filePath!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
