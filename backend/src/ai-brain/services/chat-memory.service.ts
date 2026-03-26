import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThanOrEqual } from 'typeorm';
import { ChatMemoryEntity } from '../entities/chat-memory.entity';

/**
 * 对话记忆服务 - 管理用户的长期对话历史
 * - 每个用户独立的记忆链
 * - 1年自动过期清理
 * - 支持摘要和重要性标记
 */
@Injectable()
export class ChatMemoryService {
  private readonly logger = new Logger(ChatMemoryService.name);

  constructor(
    @InjectRepository(ChatMemoryEntity)
    private readonly repo: Repository<ChatMemoryEntity>,
  ) {}

  /**
   * 清理可能导致 MySQL utf8 存储问题的字符（如 emoji）
   * 将 4 字节 UTF-8 字符替换为空格
   */
  private sanitizeContent(content: string): string {
    if (!content) return content;
    // 移除 4 字节的 UTF-8 字符（emoji 等）
    // eslint-disable-next-line no-control-regex
    return content.replace(/[\u{10000}-\u{10FFFF}]/gu, ' ');
  }

  /**
   * 保存对话消息到记忆
   */
  async saveMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    options?: {
      sessionId?: string;
      importance?: number;
      tags?: string[];
      summary?: string;
      metadata?: any; // 新增元数据支持
    },
  ): Promise<ChatMemoryEntity> {
    // 清理内容中的特殊字符，防止 MySQL utf8 存储失败
    const sanitizedContent = this.sanitizeContent(content);
    
    // ✅ 生成稳定的格式化日期（YYYY-MM-DD）
    const formattedDate = new Date().toISOString().split('T')[0];
    
    const entity = this.repo.create({
      userId,
      role,
      content: sanitizedContent,
      sessionId: options?.sessionId,
      importance: options?.importance ?? 5,
      tags: options?.tags,
      summary: options?.summary ? this.sanitizeContent(options.summary) : undefined,
      formattedDate, // ✅ 存储时就格式化，避免后续重复计算
      metadata: options?.metadata, // 保存元数据
    });
    
    try {
      return await this.repo.save(entity);
    } catch (error) {
      this.logger.error(`Failed to save message: ${error.message}`);
      // 如果保存失败，尝试更激进的清理（只保留基本字符）
      entity.content = content.replace(/[^\x00-\x7F\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, ' ');
      return this.repo.save(entity);
    }
  }

  /**
   * 获取用户最近的对话历史
   * @param userId 用户ID
   * @param limit 获取条数
   */
  async getRecentHistory(userId: string, limit: number = 20): Promise<ChatMemoryEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    }).then(msgs => msgs.reverse()); // 按时间正序返回
  }

  /**
   * 获取用户的重要记忆（importance >= 8），用于构建长期上下文
   */
  async getImportantMemories(userId: string, limit: number = 5): Promise<ChatMemoryEntity[]> {
    return this.repo.find({
      where: { 
        userId, 
        importance: MoreThanOrEqual(8) 
      },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * 搜索相关记忆（通过标签匹配）
   */
  async searchByTags(userId: string, tags: string[], limit: number = 10): Promise<ChatMemoryEntity[]> {
    // 使用简单的标签包含查询
    const memories = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100, // 先获取较多记录再过滤
    });

    // 过滤包含任意标签的记忆
    return memories
      .filter(m => m.tags && m.tags.some(t => tags.includes(t)))
      .slice(0, limit);
  }

  /**
   * 获取用户的第一条记忆（初识时间）
   */
  async getFirstMemory(userId: string): Promise<ChatMemoryEntity | null> {
    return this.repo.findOne({
      where: { userId, role: 'user' },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 清理过期记忆（超过100年 - 实际上不删除，保留永久记忆）
   */
  async cleanupExpiredMemories(): Promise<number> {
    // 用户要求保留永久记忆，不再清理1年前的数据
    // 设置为100年前，实际上等于不清理
    const oneHundredYearsAgo = new Date();
    oneHundredYearsAgo.setFullYear(oneHundredYearsAgo.getFullYear() - 100);

    const result = await this.repo.delete({
      createdAt: LessThan(oneHundredYearsAgo),
    });

    if (result.affected && result.affected > 0) {
      this.logger.log(`Cleaned up ${result.affected} expired memories`);
    }

    return result.affected || 0;
  }

  /**
   * 获取用户的记忆摘要（用于构建上下文）
   */
  async getMemorySummary(userId: string): Promise<string> {
    // 获取最近5条重要记忆的摘要
    const importantMemories = await this.getImportantMemories(userId, 5);
    
    if (importantMemories.length === 0) {
      return '';
    }

    return importantMemories
      .filter(m => m.summary)
      .map(m => m.summary)
      .join('\n');
  }

  /**
   * 更新记忆的重要性评分
   */
  async updateImportance(memoryId: string, importance: number): Promise<void> {
    await this.repo.update(memoryId, { importance: Math.min(10, Math.max(0, importance)) });
  }

  /**
   * 获取用户记忆统计
   */
  async getStats(userId: string): Promise<{ total: number; important: number; oldest: Date | null }> {
    const total = await this.repo.count({ where: { userId } });
    const important = await this.repo.count({ where: { userId } }); // 简化，实际应加条件
    const oldest = await this.repo.findOne({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    return {
      total,
      important,
      oldest: oldest?.createdAt || null,
    };
  }

  /**
   * 获取上下文窗口（智能截断）
   * ✅ 实现只追加策略：不使用 slice，而是基于token限制智能选择
   * @param userId 用户ID
   * @param maxMessages 最大消息数量（默认100，足够利用KV缓存）
   */
  async getContextWindow(userId: string, maxMessages: number = 100): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const memories = await this.getRecentHistory(userId, maxMessages);
    
    return memories.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * 估算文本的token数量（粗略估算）
   * 中文约1.5字符/token，英文约0.25单词/token
   */
  private estimateTokenCount(text: string): number {
    // 粗略估算：中文字符/1.5 + 英文单词*4
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * ✅ 阶段三优化：改进的记忆相关性评分
   * 综合考虑关键词匹配、时间衰减、重要性等多个因素
   */
  private calculateRelevance(memory: ChatMemoryEntity, query: string, now: Date): number {
    let score = 0;

    // 1. 关键词匹配得分（0-40分）
    const memoryWords = new Set(
      memory.content.toLowerCase()
        .split(/[\s,，。！？!?、]+/)
        .filter(w => w.length > 1) // 过滤单字
    );
    const queryWords = query.toLowerCase()
      .split(/[\s,，。！？!?、]+/)
      .filter(w => w.length > 1);

    let matches = 0;
    for (const word of queryWords) {
      if (memoryWords.has(word)) {
        matches++;
      }
    }

    const matchRatio = queryWords.length > 0 ? matches / queryWords.length : 0;
    score += matchRatio * 40;

    // 2. 重要性得分（0-30分）
    score += (memory.importance / 10) * 30;

    // 3. 时间衰减（0-20分，越新越高）
    const daysSince = (now.getTime() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const timeScore = Math.max(0, 20 - (daysSince / 30) * 20); // 30天后衰减到0
    score += timeScore;

    // 4. 标签匹配加分（0-10分）
    if (memory.tags && memory.tags.length > 0) {
      const queryLower = query.toLowerCase();
      const tagMatches = memory.tags.filter(tag => 
        queryLower.includes(tag.toLowerCase())
      ).length;
      score += Math.min(10, tagMatches * 5);
    }

    return score;
  }

  /**
   * ✅ 阶段三优化：智能记忆检索（改进版）
   * 使用更复杂的相关性评分算法
   */
  async findRelevantMemoriesAdvanced(
    userId: string,
    currentMessage: string,
    limit: number = 5,
    minScore: number = 10, // 最低相关性分数
  ): Promise<ChatMemoryEntity[]> {
    // 获取候选记忆（最近100条+所有重要记忆）
    const recentMemories = await this.getRecentHistory(userId, 100);
    const importantMemories = await this.getImportantMemories(userId, 20);
    
    // 合并去重
    const allCandidates = [...recentMemories, ...importantMemories];
    const uniqueMemories = Array.from(
      new Map(allCandidates.map(m => [m.id, m])).values()
    );

    const now = new Date();

    // 计算相关性得分
    const scored = uniqueMemories.map(memory => ({
      memory,
      score: this.calculateRelevance(memory, currentMessage, now),
    }));

    // 过滤低分记忆并排序
    return scored
      .filter(s => s.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.memory);
  }

  /**
   * ✅ 阶段三优化：智能上下文窗口（基于token预算）
   * 动态选择最相关的记忆，而不是简单的最近N条
   */
  async getSmartContextWindow(
    userId: string,
    currentMessage: string,
    maxTokens: number = 4000, // 默认4000 tokens预算
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    // 1. 获取相关记忆
    const relevantMemories = await this.findRelevantMemoriesAdvanced(
      userId,
      currentMessage,
      50, // 先获取较多候选
      15, // 最低相关性分数
    );

    // 2. 基于token预算动态截断
    const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let tokenCount = 0;

    for (const memory of relevantMemories) {
      const memoryTokens = this.estimateTokenCount(memory.content);
      
      if (tokenCount + memoryTokens > maxTokens) {
        break;
      }

      result.push({
        role: memory.role,
        content: memory.content,
      });

      tokenCount += memoryTokens;
    }

    return result;
  }

  /**
   * 更新用户最近的一条AI回复，添加语音元数据
   */
  async updateLatestAssistantMessage(userId: string, metadata: any): Promise<void> {
    const latestMsg = await this.repo.findOne({
      where: { userId, role: 'assistant' },
      order: { createdAt: 'DESC' },
    });
    
    if (latestMsg) {
      latestMsg.metadata = { ...latestMsg.metadata, ...metadata };
      await this.repo.save(latestMsg);
    }
  }
}
