import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Tree,
  TreeChildren,
  TreeParent,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 知识点实体 - 支持树形层级结构
 * 
 * 结构示例：
 * - 科目（Level 1）：数学、英语、政治
 *   - 章节（Level 2）：数据结构、操作系统
 *     - 知识点（Level 3）：链表、树、图
 */
@Entity({ name: 'knowledge_points' })
@Tree('closure-table')
export class KnowledgePointEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /**
   * 层级：1=科目, 2=章节, 3=知识点
   */
  @Column({ type: 'int', default: 1 })
  level: number;

  /**
   * 科目代码（如：math, english, politics, cs408）
   */
  @Column({ length: 50, nullable: true })
  subjectCode: string;

  /**
   * 排序序号
   */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /**
   * 是否启用
   */
  @Column({ default: true })
  isActive: boolean;

  /**
   * 扩展属性（JSON格式）
   * 可存储：难度、重要度、考试频率等
   */
  @Column({ type: 'simple-json', nullable: true })
  metadata: {
    difficulty?: number; // 1-5
    importance?: number; // 1-5
    examFrequency?: number; // 考试频率
    tags?: string[];
  };

  @TreeParent()
  parent: KnowledgePointEntity;

  @TreeChildren()
  children: KnowledgePointEntity[];

  @Column({ nullable: true })
  parentId: string;

  /**
   * 创建者用户ID（可选，用于用户自定义知识点）
   */
  @Column({ nullable: true })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
