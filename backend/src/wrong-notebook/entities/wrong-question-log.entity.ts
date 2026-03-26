import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuestionEntity } from '../../question-bank/entities/question.entity';

@Entity({ name: 'wrong_question_logs' })
export class WrongQuestionLogEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  questionId: string;

  @ManyToOne(() => QuestionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'questionId' })
  question: QuestionEntity;

  @Column()
  questionSetId: string;

  @Column({ type: 'int', default: 1 })
  wrongCount: number;

  @Column('simple-array', { nullable: true })
  tags: string[]; // e.g., ["calculation_error", "concept_missing"]

  @Column('simple-array', { nullable: true })
  knowledgePointIds: string[]; // e.g., ["kp_123", "kp_456"]

  @Column({ type: 'text', nullable: true })
  lastAnswer: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
