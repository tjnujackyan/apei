import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StudyTaskEntity } from './study-task.entity';

export type StudyPlanStatus = 'draft' | 'active' | 'completed' | 'cancelled';

/**
 * 学习计划实体
 */
@Entity({ name: 'study_plans' })
export class StudyPlanEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 'active' })
  status: StudyPlanStatus;

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date' })
  endDate: Date;

  /**
   * 计划类型
   */
  @Column({ length: 50, default: 'general' })
  planType: string; // general, weakness_focus, exam_prep

  /**
   * 关联的科目代码
   */
  @Column({ length: 50, nullable: true })
  subjectCode: string;

  /**
   * 扩展元数据
   */
  @Column({ type: 'simple-json', nullable: true })
  metadata: {
    generatedBy?: 'ai' | 'manual'; // 生成方式
    dailyTimeMinutes?: number; // 每日预计用时
    difficulty?: number; // 难度等级
    tags?: string[];
  };

  @OneToMany(() => StudyTaskEntity, (task) => task.plan)
  tasks: StudyTaskEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

