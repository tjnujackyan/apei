import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

/**
 * 题目-知识点关联表
 * 多对多关系的中间表
 */
@Entity({ name: 'question_knowledge_points' })
@Index(['questionId', 'knowledgePointId'], { unique: true })
export class QuestionKnowledgePointEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 题目ID
   */
  @Column()
  @Index()
  questionId: string;

  /**
   * 知识点ID
   */
  @Column()
  @Index()
  knowledgePointId: string;

  /**
   * 关联类型
   * - primary: 主要知识点
   * - secondary: 次要知识点
   */
  @Column({ default: 'primary' })
  relationType: 'primary' | 'secondary';

  /**
   * 权重（1-10）
   * 表示该知识点在此题目中的重要程度
   */
  @Column({ type: 'int', default: 5 })
  weight: number;

  @CreateDateColumn()
  createdAt: Date;
}

