import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { WrongQuestionLogEntity } from '../../wrong-notebook/entities/wrong-question-log.entity';
import { PracticeItemLogEntity } from '../../practice/entities/practice-item-log.entity';
import { KnowledgePointEntity } from '../../knowledge-points/entities/knowledge-point.entity';
import { WeaknessPoint } from '../dto/review-status.dto';

/**
 * 薄弱点检测服务
 * 基于错题记录识别用户的知识薄弱点
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
@Injectable()
export class WeaknessDetectorService {
  private readonly logger = new Logger(WeaknessDetectorService.name);

  // 薄弱点筛选阈值
  private readonly ERROR_RATE_THRESHOLD = 0.4; // 错误率 > 40%
  private readonly MIN_ERROR_COUNT = 2; // 错误次数 >= 2

  constructor(
    @InjectRepository(WrongQuestionLogEntity)
    private readonly wrongLogRepo: Repository<WrongQuestionLogEntity>,
    @InjectRepository(PracticeItemLogEntity)
    private readonly practiceLogRepo: Repository<PracticeItemLogEntity>,
    @InjectRepository(KnowledgePointEntity)
    private readonly kpRepo: Repository<KnowledgePointEntity>,
  ) {}

  /**
   * 检测用户的知识薄弱点
   * 
   * 算法逻辑：
   * 1. 获取用户所有错题记录
   * 2. 按知识点聚合统计：错误次数、总尝试次数、最近错误时间
   * 3. 计算错误率 = 错误次数 / 总尝试次数
   * 4. 筛选：错误率 > 40% AND 错误次数 >= 2
   * 5. 按薄弱程度排序：错误率 × 错误次数 DESC
   * 
   * @param userId 用户ID
   * @returns 薄弱知识点列表，按薄弱程度降序排列
   */
  async detect(userId: string): Promise<WeaknessPoint[]> {
    this.logger.log(`Detecting weaknesses for user: ${userId}`);

    // 1. 获取用户所有错题记录
    const wrongLogs = await this.wrongLogRepo.find({
      where: { userId },
    });

    // 如果没有错题记录，返回空列表 (Requirement 1.5)
    if (wrongLogs.length === 0) {
      this.logger.log(`No wrong logs found for user: ${userId}`);
      return [];
    }

    // 2. 获取用户所有练习记录，用于计算总尝试次数
    const practiceLogs = await this.practiceLogRepo.find({
      where: { userId },
    });

    // 3. 按知识点聚合统计
    const kpStats = this.aggregateByKnowledgePoint(wrongLogs, practiceLogs);

    // 4. 筛选薄弱点：错误率 > 40% 且 错误次数 >= 2 (Requirement 1.3)
    const weaknessStats = Array.from(kpStats.entries()).filter(([_, stats]) => {
      const errorRate = stats.errorCount / stats.totalAttempts;
      return errorRate > this.ERROR_RATE_THRESHOLD && stats.errorCount >= this.MIN_ERROR_COUNT;
    });

    if (weaknessStats.length === 0) {
      this.logger.log(`No weaknesses found for user: ${userId}`);
      return [];
    }

    // 5. 过滤出有效的 UUID 格式的知识点ID
    const validUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validKpIds = weaknessStats
      .map(([kpId]) => kpId)
      .filter(kpId => validUuidRegex.test(kpId));

    if (validKpIds.length === 0) {
      this.logger.log(`No valid UUID knowledge point IDs found for user: ${userId}`);
      // 返回不带知识点名称的薄弱点列表
      return weaknessStats.map(([kpId, stats]) => {
        const errorRate = stats.errorCount / stats.totalAttempts;
        const weaknessScore = errorRate * stats.errorCount;
        return {
          knowledgePointId: kpId,
          knowledgePointName: kpId, // 使用ID作为名称（可能是标签）
          errorRate,
          errorCount: stats.errorCount,
          totalAttempts: stats.totalAttempts,
          lastErrorAt: stats.lastErrorAt,
          weaknessScore,
          relatedQuestionIds: stats.questionIds,
        };
      }).sort((a, b) => b.weaknessScore - a.weaknessScore);
    }

    // 6. 获取知识点详情（只查询有效的UUID）
    const kpEntities = await this.kpRepo.find({
      where: { id: In(validKpIds) },
    });
    const kpMap = new Map(kpEntities.map((kp) => [kp.id, kp]));

    // 7. 构建薄弱点列表并计算薄弱程度分数
    const weaknesses: WeaknessPoint[] = weaknessStats.map(([kpId, stats]) => {
      const kp = kpMap.get(kpId);
      const errorRate = stats.errorCount / stats.totalAttempts;
      // 薄弱程度 = 错误率 × 错误次数 (Requirement 1.4)
      const weaknessScore = errorRate * stats.errorCount;

      return {
        knowledgePointId: kpId,
        knowledgePointName: kp?.name || kpId, // 如果找不到知识点，使用ID作为名称
        errorRate,
        errorCount: stats.errorCount,
        totalAttempts: stats.totalAttempts,
        lastErrorAt: stats.lastErrorAt,
        weaknessScore,
        relatedQuestionIds: stats.questionIds,
      };
    });

    // 8. 按薄弱程度降序排列 (Requirement 1.4)
    weaknesses.sort((a, b) => b.weaknessScore - a.weaknessScore);

    this.logger.log(`Found ${weaknesses.length} weaknesses for user: ${userId}`);
    return weaknesses;
  }

  /**
   * 按知识点聚合统计错题和练习数据
   * 
   * @param wrongLogs 错题记录
   * @param practiceLogs 练习记录
   * @returns 知识点统计Map
   */
  private aggregateByKnowledgePoint(
    wrongLogs: WrongQuestionLogEntity[],
    practiceLogs: PracticeItemLogEntity[],
  ): Map<string, {
    errorCount: number;
    totalAttempts: number;
    lastErrorAt: Date;
    questionIds: string[];
  }> {
    const kpStats = new Map<string, {
      errorCount: number;
      totalAttempts: number;
      lastErrorAt: Date;
      questionIds: string[];
    }>();

    // 构建题目ID到知识点ID的映射
    const questionToKpMap = new Map<string, string[]>();
    wrongLogs.forEach((log) => {
      if (log.knowledgePointIds && log.knowledgePointIds.length > 0) {
        questionToKpMap.set(log.questionId, log.knowledgePointIds);
      }
    });

    // 统计每个知识点的错误次数和最近错误时间 (Requirement 1.1, 1.2)
    wrongLogs.forEach((log) => {
      if (log.knowledgePointIds) {
        log.knowledgePointIds.forEach((kpId) => {
          const existing = kpStats.get(kpId) || {
            errorCount: 0,
            totalAttempts: 0,
            lastErrorAt: log.updatedAt,
            questionIds: [],
          };

          existing.errorCount += log.wrongCount;
          if (!existing.questionIds.includes(log.questionId)) {
            existing.questionIds.push(log.questionId);
          }
          if (log.updatedAt > existing.lastErrorAt) {
            existing.lastErrorAt = log.updatedAt;
          }

          kpStats.set(kpId, existing);
        });
      }
    });

    // 统计每个知识点的总尝试次数
    practiceLogs.forEach((log) => {
      const kpIds = questionToKpMap.get(log.questionId);
      if (kpIds) {
        kpIds.forEach((kpId) => {
          const existing = kpStats.get(kpId);
          if (existing) {
            existing.totalAttempts += 1;
          }
        });
      }
    });

    // 对于没有练习记录的知识点，使用错误次数作为总尝试次数
    kpStats.forEach((stats, kpId) => {
      if (stats.totalAttempts === 0) {
        stats.totalAttempts = stats.errorCount;
      }
    });

    return kpStats;
  }

  /**
   * 从错题记录直接检测薄弱点（用于属性测试）
   * 这是一个纯函数，不依赖数据库查询
   * 
   * @param wrongLogs 错题记录
   * @param practiceLogs 练习记录
   * @param kpMap 知识点映射
   * @returns 薄弱知识点列表
   */
  detectFromLogs(
    wrongLogs: WrongQuestionLogEntity[],
    practiceLogs: PracticeItemLogEntity[],
    kpMap: Map<string, KnowledgePointEntity>,
  ): WeaknessPoint[] {
    if (wrongLogs.length === 0) {
      return [];
    }

    const kpStats = this.aggregateByKnowledgePoint(wrongLogs, practiceLogs);

    const weaknessStats = Array.from(kpStats.entries()).filter(([_, stats]) => {
      const errorRate = stats.errorCount / stats.totalAttempts;
      return errorRate > this.ERROR_RATE_THRESHOLD && stats.errorCount >= this.MIN_ERROR_COUNT;
    });

    const weaknesses: WeaknessPoint[] = weaknessStats.map(([kpId, stats]) => {
      const kp = kpMap.get(kpId);
      const errorRate = stats.errorCount / stats.totalAttempts;
      const weaknessScore = errorRate * stats.errorCount;

      return {
        knowledgePointId: kpId,
        knowledgePointName: kp?.name || 'Unknown',
        errorRate,
        errorCount: stats.errorCount,
        totalAttempts: stats.totalAttempts,
        lastErrorAt: stats.lastErrorAt,
        weaknessScore,
        relatedQuestionIds: stats.questionIds,
      };
    });

    weaknesses.sort((a, b) => b.weaknessScore - a.weaknessScore);

    return weaknesses;
  }
}
