import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuestionSetEntity } from './question-set.entity';

export type QuestionType = 'single' | 'multiple' | 'true_false';

export interface QuestionOption {
  label: string;
  content: string;
  isCorrect: boolean;
}

@Entity({ name: 'questions' })
export class QuestionEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  questionSetId: string;

  @ManyToOne(() => QuestionSetEntity, (set) => set.questions, {
    onDelete: 'CASCADE',
  })
  questionSet: QuestionSetEntity;

  @Column()
  stem: string;

  @Column()
  type: QuestionType;

  @Column('simple-json')
  options: QuestionOption[];

  @Column('simple-json')
  knowledgeTags: string[];

  /**
   * 关联的知识点ID数组
   * 使用JSON存储多个知识点ID
   */
  @Column('simple-json', { nullable: true })
  knowledgePointIds: string[];

  @Column({ nullable: true })
  answerExplanation?: string;

  @Column({ type: 'int', nullable: true })
  difficulty?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
