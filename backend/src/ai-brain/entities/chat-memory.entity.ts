import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * 对话记忆实体 - 存储用户与AI的长期对话历史
 * 保留期限: 1年
 * 每个用户的记忆链独立隔离
 */
@Entity({ name: 'chat_memories' })
@Index(['userId', 'createdAt'])
export class ChatMemoryEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  role: 'user' | 'assistant';

  @Column({ type: 'text' })
  content: string;

  /**
   * 对话摘要（由AI生成，用于快速检索）
   */
  @Column({ type: 'text', nullable: true })
  summary?: string;

  /**
   * 关键词标签（用于相关性检索）
   */
  @Column('simple-array', { nullable: true })
  tags?: string[];

  /**
   * 重要性评分 0-10（用于记忆筛选）
   */
  @Column({ type: 'int', default: 5 })
  importance: number;

  /**
   * 会话ID（同一次对话的消息共享同一sessionId）
   */
  @Column({ nullable: true })
  sessionId?: string;

  /**
   * 格式化后的日期字符串（YYYY-MM-DD格式）
   * ✅ 用于稳定上下文：避免每次都重新格式化日期
   * ✅ 确保日期格式一致，不受locale影响
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  formattedDate?: string;

  /**
   * 语音消息相关元数据
   * 存储语音URL、时长等信息，用于前端回显
   */
  @Column({ type: 'json', nullable: true })
  metadata?: {
    type?: 'voice' | 'text';
    audioUrl?: string;
    duration?: number;
    blocks?: any[];
    // 未来可扩展其他字段
  };

  @CreateDateColumn()
  createdAt: Date;
}
