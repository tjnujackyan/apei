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
import { QuestionSetEntity } from '../../question-bank/entities/question-set.entity';

/**
 * 薄弱点快照接口
 */
export interface WeaknessPointSnapshot {
  knowledgePointId: string;
  knowledgePointName: string;
  errorRate: number;
  errorCount: number;
  totalAttempts: number;
  lastErrorAt: string;
  weaknessScore: number;
  relatedQuestionIds: string[];
}

/**
 * 新学知识快照接口
 */
export interface NewKnowledgeSnapshot {
  knowledgePointId: string;
  knowledgePointName: string;
  questionCount: number;
  practiceCount: number;
  uploadedAt: string;
  questionIds: string[];
}

/**
 * 题目来源统计接口
 */
export interface QuestionSourceStats {
  originalCount: number;      // 原题数量
  transformedCount: number;   // 变式题数量
  weaknessCount: number;      // 薄弱点题目数量
  newKnowledgeCount: number;  // 新学知识题目数量
}

/**
 * 生成参数接口
 */
export interface GenerationParams {
  weaknessRatio: number;
  newKnowledgeRatio: number;
  totalCount: number;
  enableTransform: boolean;
}

export type ReviewSessionStatus = 'pending' | 'in_progress' | 'completed';
export type ReviewType = 'smart_review' | 'weakness_focus' | 'new_knowledge';

/**
 * 复习会话实体 - 记录每次复习会话的详细信息
 * 用于效果追踪和算法优化
 */
@Entity({ name: 'review_sessions' })
export class ReviewSessionEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  questionSetId: string;

  @ManyToOne(() => QuestionSetEntity)
  @JoinColumn({ name: 'questionSetId' })
  questionSet: QuestionSetEntity;

  /**
   * 复习类型：smart_review | weakness_focus | new_knowledge
   */
  @Column({ default: 'smart_review' })
  reviewType: ReviewType;

  /**
   * 生成参数快照
   */
  @Column({ type: 'simple-json' })
  generationParams: GenerationParams;

  /**
   * 涵盖的知识点ID列表
   */
  @Column({ type: 'simple-json' })
  coveredKnowledgePointIds: string[];

  /**
   * 薄弱点快照
   */
  @Column({ type: 'simple-json' })
  weaknessSnapshot: WeaknessPointSnapshot[];

  /**
   * 新学知识快照
   */
  @Column({ type: 'simple-json' })
  newKnowledgeSnapshot: NewKnowledgeSnapshot[];

  /**
   * 题目来源统计
   */
  @Column({ type: 'simple-json' })
  questionSources: QuestionSourceStats;

  /**
   * 完成状态
   */
  @Column({ default: 'pending' })
  status: ReviewSessionStatus;

  /**
   * 总题目数量
   */
  @Column({ type: 'int', default: 0 })
  totalQuestions: number;

  /**
   * 已回答数量
   */
  @Column({ type: 'int', default: 0 })
  answeredCount: number;

  /**
   * 正确数量
   */
  @Column({ type: 'int', default: 0 })
  correctCount: number;

  /**
   * 总用时（秒）
   */
  @Column({ type: 'int', default: 0 })
  totalTimeSeconds: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
