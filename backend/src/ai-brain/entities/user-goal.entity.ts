import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 用户目标实体
 * ✅ 阶段三优化：实现类似Manus的todo.md机制
 * 
 * 通过持续复述目标到上下文末尾，避免长对话中"丢失在中间"的问题
 */
@Entity({ name: 'user_goals' })
@Index(['userId', 'completed'])
@Index(['userId', 'priority'])
export class UserGoalEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  /**
   * 目标描述
   */
  @Column({ type: 'varchar', length: 500 })
  description: string;

  /**
   * 是否已完成
   */
  @Column({ default: false })
  completed: boolean;

  /**
   * 优先级 (0-10, 10最高)
   */
  @Column({ type: 'int', default: 5 })
  priority: number;

  /**
   * 目标类型
   */
  @Column({ 
    type: 'varchar', 
    length: 50,
    default: 'general'
  })
  type: 'study_plan' | 'practice' | 'review' | 'general';

  /**
   * 截止日期（可选）
   */
  @Column({ type: 'date', nullable: true })
  deadline?: Date;

  /**
   * 进度百分比 (0-100)
   */
  @Column({ type: 'int', default: 0 })
  progress: number;

  /**
   * 备注
   */
  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

