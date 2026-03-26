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
import { KnowledgePointEntity } from '../../knowledge-points/entities/knowledge-point.entity';

/**
 * 知识状态实体 - 记录用户对各知识点的掌握状态
 * 用于后续升级到知识追踪算法（DKT/遗忘曲线）预留
 */
@Entity({ name: 'knowledge_states' })
export class KnowledgeStateEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  knowledgePointId: string;

  @ManyToOne(() => KnowledgePointEntity)
  @JoinColumn({ name: 'knowledgePointId' })
  knowledgePoint: KnowledgePointEntity;

  /**
   * 掌握度分数 (0-100)
   */
  @Column({ type: 'float', default: 50 })
  masteryScore: number;

  /**
   * 总尝试次数
   */
  @Column({ type: 'int', default: 0 })
  totalAttempts: number;

  /**
   * 正确次数
   */
  @Column({ type: 'int', default: 0 })
  correctCount: number;

  /**
   * 连续正确次数（用于判断是否掌握）
   */
  @Column({ type: 'int', default: 0 })
  consecutiveCorrect: number;

  /**
   * 最后练习时间（用于遗忘曲线计算）
   */
  @Column({ type: 'timestamp', nullable: true })
  lastPracticeAt: Date;

  /**
   * 下次建议复习时间（预留给遗忘曲线算法）
   */
  @Column({ type: 'timestamp', nullable: true })
  nextReviewAt: Date;

  /**
   * 扩展元数据（预留给 DKT 等高级算法）
   */
  @Column({ type: 'simple-json', nullable: true })
  metadata: {
    dktProbability?: number;   // DKT 预测的掌握概率
    forgettingFactor?: number; // 遗忘因子
    learningRate?: number;     // 学习速率
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
