import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PracticeStatus = 'active' | 'completed';

@Entity({ name: 'practice_sessions' })
export class PracticeSessionEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  questionSetId: string;

  /**
   * 关联的复习会话ID
   * 如果此练习会话是智能复习生成的，则关联到对应的 ReviewSession
   */
  @Column({ nullable: true })
  reviewSessionId?: string;

  @Column({ default: 'active' })
  status: PracticeStatus;

  @Column({ type: 'int', default: 0 })
  totalQuestions: number;

  @Column({ type: 'int', default: 0 })
  answeredCount: number;

  @Column({ type: 'int', default: 0 })
  correctCount: number;

  @Column({ type: 'int', default: 0 })
  totalTimeSeconds: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
