import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StudyPlanEntity } from './study-plan.entity';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type TaskType = 'review' | 'practice' | 'weak_focus' | 'mock_exam' | 'custom';

/**
 * 学习任务实体
 */
@Entity({ name: 'study_tasks' })
export class StudyTaskEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  planId: string;

  @ManyToOne(() => StudyPlanEntity, (plan) => plan.tasks, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  plan: StudyPlanEntity;

  @Column()
  userId: string;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 'pending' })
  status: TaskStatus;

  @Column({ default: 'practice' })
  taskType: TaskType;

  /**
   * 任务日期（哪一天的任务）
   */
  @Column({ type: 'date' })
  taskDate: Date;

  /**
   * 预计用时（分钟）
   */
  @Column({ type: 'int', nullable: true })
  estimatedMinutes: number;

  /**
   * 实际用时（分钟）
   */
  @Column({ type: 'int', nullable: true })
  actualMinutes: number;

  /**
   * 排序序号
   */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /**
   * 关联的知识点ID（可选）
   */
  @Column('simple-json', { nullable: true })
  knowledgePointIds: string[];

  /**
   * 关联的题集ID（可选）
   */
  @Column({ nullable: true })
  questionSetId: string;

  /**
   * 任务元数据
   */
  @Column({ type: 'simple-json', nullable: true })
  metadata: {
    targetQuestionCount?: number; // 目标题数
    completedQuestionCount?: number; // 已完成题数
    correctRate?: number; // 正确率
    tags?: string[];
  };

  /**
   * 完成时间
   */
  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

