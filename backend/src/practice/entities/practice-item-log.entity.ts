import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'practice_item_logs' })
export class PracticeItemLogEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @Column()
  userId: string;

  @Column()
  questionId: string;

  @Column({ type: 'boolean' })
  isCorrect: boolean;

  @Column({ type: 'int', default: 0 })
  timeSpentSeconds: number;

  @Column({ type: 'simple-json', nullable: true })
  answerPayload?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
