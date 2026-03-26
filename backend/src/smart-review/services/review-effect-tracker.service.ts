import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, In } from 'typeorm';
import { ReviewSessionEntity } from '../entities/review-session.entity';
import { KnowledgeStateEntity } from '../entities/knowledge-state.entity';
import { PracticeItemLogEntity } from '../../practice/entities/practice-item-log.entity';
import { KnowledgeStateService } from './knowledge-state.service';

/**
 * 复习完成统计接口
 */
export interface CompletionStats {
  answeredCount: number;
  correctCount: number;
  totalTimeSeconds: number;
  questionResults?: Array<{
    questionId: string;
    isCorrect: boolean;
    isTransformed: boolean;
    knowledgePointIds: string[];
  }>;
}

/**
 * 进度报告接口
 */
export interface ProgressReport {
  knowledgePointId: string;
  knowledgePointName: string;
  currentMasteryScore: number;
  previousMasteryScore: number;
  masteryChange: number;
  totalAttempts: number;
  correctCount: number;
  correctRate: number;
  consecutiveCorrect: number;
  isWeakness: boolean;
  recentSessions: Array<{
    sessionId: string;
    correctRate: number;
    completedAt: Date;
  }>;
  trend: 'improving' | 'stable' | 'declining';
}

/**
 * 知识点复习历史接口
 */
export interface KnowledgePointReviewHistory {
  knowledgePointId: string;
  sessions: Array<{
    sessionId: string;
    correctRate: number;
    completedAt: Date;
  }>;
}

/**
 * 复习效果追踪服务
 * 
 * 负责记录复习完成情况、追踪进度变化、判断薄弱点移除条件
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
@Injectable()
export class ReviewEffectTrackerService {
  private readonly logger = new Logger(ReviewEffectTrackerService.name);

  // 薄弱点移除条件：连续3次正确率 >= 80%
  private readonly WEAKNESS_REMOVAL_CONSECUTIVE_COUNT = 3;
  private readonly WEAKNESS_REMOVAL_CORRECT_RATE_THRESHOLD = 0.8;

  constructor(
    @InjectRepository(ReviewSessionEntity)
    private readonly reviewSessionRepo: Repository<ReviewSessionEntity>,
    @InjectRepository(KnowledgeStateEntity)
    private readonly knowledgeStateRepo: Repository<KnowledgeStateEntity>,
    @InjectRepository(PracticeItemLogEntity)
    private readonly practiceLogRepo: Repository<PracticeItemLogEntity>,
    private readonly knowledgeStateService: KnowledgeStateService,
  ) {}

  /**
   * 记录复习会话完成情况
   * 
   * Requirement 7.1: 记录本次复习的正确率和用时
   * Requirement 7.5: 记录每次复习的题目来源（原题/变式题）和效果数据
   * 
   * @param sessionId 复习会话ID
   * @param stats 完成统计数据
   */
  async recordCompletion(
    sessionId: string,
    stats: CompletionStats,
  ): Promise<void> {
    this.logger.log(`Recording completion for session: ${sessionId}`);

    // 查找复习会话
    const session = await this.reviewSessionRepo.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Review session not found: ${sessionId}`);
    }

    // 更新会话统计数据 (Requirement 7.1)
    session.answeredCount = stats.answeredCount;
    session.correctCount = stats.correctCount;
    session.totalTimeSeconds = stats.totalTimeSeconds;
    session.status = 'completed';

    await this.reviewSessionRepo.save(session);

    // 如果提供了详细的题目结果，更新知识状态
    if (stats.questionResults && stats.questionResults.length > 0) {
      await this.updateKnowledgeStatesFromResults(
        session.userId,
        stats.questionResults,
      );
    }

    this.logger.log(
      `Session ${sessionId} completed: ${stats.correctCount}/${stats.answeredCount} correct, ${stats.totalTimeSeconds}s`,
    );
  }

  /**
   * 获取知识点进度报告
   * 
   * Requirement 7.2: 对比用户在同一知识点上的历史正确率变化
   * Requirement 7.4: 提供复习效果报告，展示知识点掌握度变化趋势
   * 
   * @param userId 用户ID
   * @param knowledgePointId 知识点ID
   * @returns 进度报告
   */
  async getProgressReport(
    userId: string,
    knowledgePointId: string,
  ): Promise<ProgressReport> {
    this.logger.log(
      `Getting progress report for user: ${userId}, kp: ${knowledgePointId}`,
    );

    // 获取当前知识状态
    const currentState = await this.knowledgeStateService.getState(
      userId,
      knowledgePointId,
    );

    // 获取该知识点相关的复习会话历史
    const recentSessions = await this.getKnowledgePointReviewHistory(
      userId,
      knowledgePointId,
      10, // 最近10次会话
    );

    // 计算正确率
    const correctRate = currentState && currentState.totalAttempts > 0
      ? currentState.correctCount / currentState.totalAttempts
      : 0;

    // 计算掌握度变化趋势 (Requirement 7.2)
    const trend = this.calculateTrend(recentSessions.sessions);

    // 计算之前的掌握度分数（基于历史数据估算）
    const previousMasteryScore = this.estimatePreviousMasteryScore(
      currentState?.masteryScore ?? 50,
      trend,
    );

    // 检查是否仍是薄弱点
    const isWeakness = await this.checkIsWeakness(userId, knowledgePointId);

    return {
      knowledgePointId,
      knowledgePointName: currentState?.knowledgePoint?.name || 'Unknown',
      currentMasteryScore: currentState?.masteryScore ?? 50,
      previousMasteryScore,
      masteryChange: (currentState?.masteryScore ?? 50) - previousMasteryScore,
      totalAttempts: currentState?.totalAttempts ?? 0,
      correctCount: currentState?.correctCount ?? 0,
      correctRate,
      consecutiveCorrect: currentState?.consecutiveCorrect ?? 0,
      isWeakness,
      recentSessions: recentSessions.sessions,
      trend,
    };
  }

  /**
   * 检查是否应该移除薄弱点
   * 
   * Requirement 7.3: 连续3次正确率>=80%时移除薄弱点
   * 
   * @param userId 用户ID
   * @param knowledgePointId 知识点ID
   * @returns 是否应该移除薄弱点
   */
  async checkWeaknessRemoval(
    userId: string,
    knowledgePointId: string,
  ): Promise<boolean> {
    this.logger.log(
      `Checking weakness removal for user: ${userId}, kp: ${knowledgePointId}`,
    );

    // 获取该知识点的最近复习会话
    const recentHistory = await this.getKnowledgePointReviewHistory(
      userId,
      knowledgePointId,
      this.WEAKNESS_REMOVAL_CONSECUTIVE_COUNT,
    );

    // 如果会话数量不足，不移除
    if (recentHistory.sessions.length < this.WEAKNESS_REMOVAL_CONSECUTIVE_COUNT) {
      this.logger.log(
        `Not enough sessions (${recentHistory.sessions.length}) for weakness removal check`,
      );
      return false;
    }

    // 检查最近N次会话的正确率是否都 >= 80%
    const allAboveThreshold = recentHistory.sessions
      .slice(0, this.WEAKNESS_REMOVAL_CONSECUTIVE_COUNT)
      .every(
        (session) => session.correctRate >= this.WEAKNESS_REMOVAL_CORRECT_RATE_THRESHOLD,
      );

    if (allAboveThreshold) {
      this.logger.log(
        `Weakness removal condition met for kp: ${knowledgePointId}`,
      );
    }

    return allAboveThreshold;
  }

  /**
   * 获取知识点的复习会话历史
   * 
   * @param userId 用户ID
   * @param knowledgePointId 知识点ID
   * @param limit 限制数量
   * @returns 复习历史
   */
  private async getKnowledgePointReviewHistory(
    userId: string,
    knowledgePointId: string,
    limit: number,
  ): Promise<KnowledgePointReviewHistory> {
    // 查找包含该知识点的已完成复习会话
    const sessions = await this.reviewSessionRepo.find({
      where: {
        userId,
        status: 'completed',
      },
      order: {
        updatedAt: 'DESC',
      },
      take: limit * 2, // 多取一些，因为需要过滤
    });

    // 过滤出包含该知识点的会话
    const relevantSessions = sessions
      .filter((session) =>
        session.coveredKnowledgePointIds?.includes(knowledgePointId),
      )
      .slice(0, limit);

    return {
      knowledgePointId,
      sessions: relevantSessions.map((session) => ({
        sessionId: session.id,
        correctRate:
          session.answeredCount > 0
            ? session.correctCount / session.answeredCount
            : 0,
        completedAt: session.updatedAt,
      })),
    };
  }

  /**
   * 计算掌握度变化趋势
   * 
   * @param sessions 最近的会话记录
   * @returns 趋势：improving | stable | declining
   */
  private calculateTrend(
    sessions: Array<{ correctRate: number }>,
  ): 'improving' | 'stable' | 'declining' {
    if (sessions.length < 2) {
      return 'stable';
    }

    // 计算最近几次的正确率变化
    const recentRates = sessions.slice(0, Math.min(5, sessions.length));
    
    // 计算平均变化率
    let totalChange = 0;
    for (let i = 0; i < recentRates.length - 1; i++) {
      // 注意：sessions是按时间降序排列的，所以较新的在前面
      totalChange += recentRates[i].correctRate - recentRates[i + 1].correctRate;
    }

    const avgChange = totalChange / (recentRates.length - 1);

    // 判断趋势
    if (avgChange > 0.05) {
      return 'improving';
    } else if (avgChange < -0.05) {
      return 'declining';
    }
    return 'stable';
  }

  /**
   * 估算之前的掌握度分数
   * 
   * @param currentScore 当前分数
   * @param trend 趋势
   * @returns 估算的之前分数
   */
  private estimatePreviousMasteryScore(
    currentScore: number,
    trend: 'improving' | 'stable' | 'declining',
  ): number {
    switch (trend) {
      case 'improving':
        return Math.max(currentScore - 10, 0);
      case 'declining':
        return Math.min(currentScore + 10, 100);
      default:
        return currentScore;
    }
  }

  /**
   * 检查知识点是否仍是薄弱点
   * 
   * @param userId 用户ID
   * @param knowledgePointId 知识点ID
   * @returns 是否是薄弱点
   */
  private async checkIsWeakness(
    userId: string,
    knowledgePointId: string,
  ): Promise<boolean> {
    const state = await this.knowledgeStateService.getState(
      userId,
      knowledgePointId,
    );

    if (!state) {
      return false;
    }

    // 薄弱点条件：错误率 > 40% 且 总尝试次数 >= 2
    const errorRate = state.totalAttempts > 0
      ? 1 - (state.correctCount / state.totalAttempts)
      : 0;

    return errorRate > 0.4 && state.totalAttempts >= 2;
  }

  /**
   * 根据题目结果更新知识状态
   * 
   * @param userId 用户ID
   * @param results 题目结果列表
   */
  private async updateKnowledgeStatesFromResults(
    userId: string,
    results: Array<{
      questionId: string;
      isCorrect: boolean;
      isTransformed: boolean;
      knowledgePointIds: string[];
    }>,
  ): Promise<void> {
    // 按知识点聚合结果
    const kpResults = new Map<string, { correct: number; total: number }>();

    for (const result of results) {
      for (const kpId of result.knowledgePointIds) {
        const existing = kpResults.get(kpId) || { correct: 0, total: 0 };
        existing.total += 1;
        if (result.isCorrect) {
          existing.correct += 1;
        }
        kpResults.set(kpId, existing);
      }
    }

    // 更新每个知识点的状态
    for (const [kpId, stats] of kpResults.entries()) {
      // 对于每道题，更新一次状态
      for (let i = 0; i < stats.total; i++) {
        const isCorrect = i < stats.correct;
        await this.knowledgeStateService.updateState(userId, kpId, isCorrect);
      }
    }
  }

  /**
   * 获取用户的整体复习效果统计
   * 
   * @param userId 用户ID
   * @param daysRange 统计天数范围
   * @returns 整体统计数据
   */
  async getOverallStats(
    userId: string,
    daysRange: number = 30,
  ): Promise<{
    totalSessions: number;
    completedSessions: number;
    totalQuestions: number;
    totalCorrect: number;
    overallCorrectRate: number;
    totalTimeMinutes: number;
    averageSessionCorrectRate: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysRange);

    const sessions = await this.reviewSessionRepo.find({
      where: {
        userId,
        createdAt: MoreThanOrEqual(startDate),
      },
    });

    const completedSessions = sessions.filter((s) => s.status === 'completed');

    const totalQuestions = completedSessions.reduce(
      (sum, s) => sum + s.answeredCount,
      0,
    );
    const totalCorrect = completedSessions.reduce(
      (sum, s) => sum + s.correctCount,
      0,
    );
    const totalTimeSeconds = completedSessions.reduce(
      (sum, s) => sum + s.totalTimeSeconds,
      0,
    );

    const sessionCorrectRates = completedSessions
      .filter((s) => s.answeredCount > 0)
      .map((s) => s.correctCount / s.answeredCount);

    const averageSessionCorrectRate =
      sessionCorrectRates.length > 0
        ? sessionCorrectRates.reduce((a, b) => a + b, 0) / sessionCorrectRates.length
        : 0;

    return {
      totalSessions: sessions.length,
      completedSessions: completedSessions.length,
      totalQuestions,
      totalCorrect,
      overallCorrectRate: totalQuestions > 0 ? totalCorrect / totalQuestions : 0,
      totalTimeMinutes: Math.round(totalTimeSeconds / 60),
      averageSessionCorrectRate,
    };
  }

  /**
   * 获取需要移除的薄弱点列表
   * 
   * @param userId 用户ID
   * @param knowledgePointIds 待检查的知识点ID列表
   * @returns 应该移除的薄弱点ID列表
   */
  async getWeaknessesToRemove(
    userId: string,
    knowledgePointIds: string[],
  ): Promise<string[]> {
    const toRemove: string[] = [];

    for (const kpId of knowledgePointIds) {
      const shouldRemove = await this.checkWeaknessRemoval(userId, kpId);
      if (shouldRemove) {
        toRemove.push(kpId);
      }
    }

    return toRemove;
  }
}
