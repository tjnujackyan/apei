import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../users/user.entity';
import { QuestionEntity } from './question.entity';

export type QuestionSource = 'imported' | 'manual' | 'builtin' | 'ai-generated';

@Entity({ name: 'question_sets' })
export class QuestionSetEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  subject: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: 'manual' })
  source: QuestionSource;

  @Column()
  ownerId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  owner: UserEntity;

  @OneToMany(() => QuestionEntity, (q) => q.questionSet, { cascade: true })
  questions: QuestionEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
