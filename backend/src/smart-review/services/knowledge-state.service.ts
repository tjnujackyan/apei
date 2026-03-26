import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { KnowledgeStateEntity } from '../entities/knowledge-state.entity';
import { KnowledgePointEntity } from '../../knowledge-points/entities/knowledge-point.entity';

/**
 * 聚合状态接口
 * 用于按知识点层级（科目/章节/知识点）聚合统计
 */
export interface AggregatedState {
  knowledgePointId: string;
  knowledgePointName: string;
  level: number;
  masteryScore: number;
  totalAttempts: number;
  correctCount: number;
  childCount: number;
}

/**
 * 知识状态管理服务
 * 
 * 负责记录和管理用户对各知识点的掌握状态
 * 为后续升级到知识追踪算法（DKT/遗忘曲线）预留接口
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
@Injectable()
export class KnowledgeStateService {
  private readonly logger = new Logger(KnowledgeStateService.name);

  constructor(
    @InjectRepository(KnowledgeStateEntity)
    private readonly knowledgeStateRepo: Repository<KnowledgeStateEntity>,
    @InjectRepository(KnowledgePointEntity)
    private readonly knowledgePointRepo: Repository<KnowledgePointEntity>,
  ) {}

  // UUID 验证正则表达式
  private readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /**
   * 更新用户对某知识点的掌握状态
   * 
   * 更新逻辑：
   * - 总尝试次数 +1
   * - 正确时：正确次数 +1，连续正确次数 +1
   * - 错误时：连续正确次数重置为 0
   * - 更新最后练习时间为当前时间
   * - 重新计算掌握度分数
   * 
   * Requirements: 6.1, 6.2, 6.3
   * 
   * @param userId 用户ID
   * @param knowledgePointId 知识点ID
   * @param isCorrect 是否答对
   * @returns 更新后的知识状态实体，如果知识点ID无效则返回null
   */
  async updateState(
    userId: string,
    knowledgePointId: string,
    isCorrect: boolean,
  ): Promise<KnowledgeStateEntity | null> {
    this.logger.log(
      `Updating knowledge state for user: ${userId}, kp: ${knowledgePointId}, correct: ${isCorrect}`,
    );

    // 验证知识点ID是否为有效的UUID格式
    if (!this.UUID_REGEX.test(knowledgePointId)) {
      this.logger.warn(
        `Skipping non-UUID knowledge point ID: ${knowledgePointId}`,
      );
      return null;
    }

    // 查找或创建知识状态记录
    let state = await this.knowledgeStateRepo.findOne({
      where: { userId, knowledgePointId },
    });

    if (!state) {
      // 创建新的知识状态记录
      state = new KnowledgeStateEntity();
      state.userId = userId;
      state.knowledgePointId = knowledgePointId;
      state.masteryScore = 50; // 初始掌握度为50
      state.totalAttempts = 0;
      state.correctCount = 0;
      state.consecutiveCorrect = 0;
      state.metadata = {};
    }

    // 更新统计数据 (Requirement 6.2)
    state.totalAttempts += 1;

    if (isCorrect) {
      state.correctCount += 1;
      state.consecutiveCorrect += 1;
    } else {
      state.consecutiveCorrect = 0;
    }

    // 更新最后练习时间 (Requirement 6.3)
    state.lastPracticeAt = new Date();

    // 重新计算掌握度分数
    state.masteryScore = this.calculateMasteryScore(state);

    // 计算下次建议复习时间（简单的遗忘曲线预留）
    state.nextReviewAt = this.calculateNextReviewAt(state);

    // 保存更新
    await this.knowledgeStateRepo.save(state);

    this.logger.log(
      `Updated knowledge state: masteryScore=${state.masteryScore}, totalAttempts=${state.totalAttempts}`,
    );

    return state;
  }

  /**
   * 获取用户对某知识点的掌握状态
   * 
   * Requirement: 6.4
   * 
   * @param userId 用户ID
   * @param knowledgePointId 知识点ID
   * @returns 知识状态实体，如果不存在则返回null
   */
  async getState(
    userId: string,
    knowledgePointId: string,
  ): Promise<KnowledgeStateEntity | null> {
    return this.knowledgeStateRepo.findOne({
      where: { userId, knowledgePointId },
      relations: ['knowledgePoint'],
    });
  }

  /**
   * 批量获取用户的知识状态
   * 
   * @param userId 用户ID
   * @param knowledgePointIds 知识点ID列表
   * @returns 知识状态实体列表
   */
  async getStates(
    userId: string,
    knowledgePointIds: string[],
  ): Promise<KnowledgeStateEntity[]> {
    if (knowledgePointIds.length === 0) {
      return [];
    }

    return this.knowledgeStateRepo.find({
      where: {
        userId,
        knowledgePointId: In(knowledgePointIds),
      },
      relations: ['knowledgePoint'],
    });
  }

  /**
   * 获取用户所有知识状态
   * 
   * @param userId 用户ID
   * @returns 知识状态实体列表
   */
  async getAllStates(userId: string): Promise<KnowledgeStateEntity[]> {
    return this.knowledgeStateRepo.find({
      where: { userId },
      relations: ['knowledgePoint'],
    });
  }

  /**
   * 按知识点层级聚合统计用户的知识状态
   * 
   * 聚合逻辑：
   * - 获取指定层级的所有知识点
   * - 对于每个知识点，计算其下所有子知识点的加权平均掌握度
   * 
   * Requirement: 6.5
   * 
   * @param userId 用户ID
   * @param level 知识点层级（1=科目, 2=章节, 3=知识点）
   * @returns 聚合状态列表
   */
  async getAggregatedState(
    userId: string,
    level: number,
  ): Promise<AggregatedState[]> {
    this.logger.log(`Getting aggregated state for user: ${userId}, level: ${level}`);

    // 获取指定层级的所有知识点
    const knowledgePoints = await this.knowledgePointRepo.find({
      where: { level, isActive: true },
    });

    if (knowledgePoints.length === 0) {
      return [];
    }

    // 获取用户所有知识状态
    const allStates = await this.knowledgeStateRepo.find({
      where: { userId },
    });

    // 构建知识状态映射
    const stateMap = new Map<string, KnowledgeStateEntity>();
    allStates.forEach((state) => {
      stateMap.set(state.knowledgePointId, state);
    });

    // 获取所有知识点用于构建层级关系
    const allKnowledgePoints = await this.knowledgePointRepo.find({
      where: { isActive: true },
    });

    // 构建父子关系映射
    const childrenMap = new Map<string, KnowledgePointEntity[]>();
    allKnowledgePoints.forEach((kp) => {
      if (kp.parentId) {
        const children = childrenMap.get(kp.parentId) || [];
        children.push(kp);
        childrenMap.set(kp.parentId, children);
      }
    });

    // 计算每个知识点的聚合状态
    const aggregatedStates: AggregatedState[] = [];

    for (const kp of knowledgePoints) {
      const aggregated = this.aggregateKnowledgePointState(
        kp,
        stateMap,
        childrenMap,
      );
      aggregatedStates.push(aggregated);
    }

    // 按掌握度分数排序
    aggregatedStates.sort((a, b) => a.masteryScore - b.masteryScore);

    return aggregatedStates;
  }

  /**
   * 递归聚合知识点状态
   * 
   * @param kp 知识点实体
   * @param stateMap 知识状态映射
   * @param childrenMap 子知识点映射
   * @returns 聚合状态
   */
  private aggregateKnowledgePointState(
    kp: KnowledgePointEntity,
    stateMap: Map<string, KnowledgeStateEntity>,
    childrenMap: Map<string, KnowledgePointEntity[]>,
  ): AggregatedState {
    const children = childrenMap.get(kp.id) || [];

    // 如果是叶子节点（没有子节点），直接返回该知识点的状态
    if (children.length === 0) {
      const state = stateMap.get(kp.id);
      return {
        knowledgePointId: kp.id,
        knowledgePointName: kp.name,
        level: kp.level,
        masteryScore: state?.masteryScore ?? 50,
        totalAttempts: state?.totalAttempts ?? 0,
        correctCount: state?.correctCount ?? 0,
        childCount: 0,
      };
    }

    // 递归计算子节点的聚合状态
    const childStates = children.map((child) =>
      this.aggregateKnowledgePointState(child, stateMap, childrenMap),
    );

    // 计算加权平均掌握度（按尝试次数加权）
    let totalWeight = 0;
    let weightedMasterySum = 0;
    let totalAttempts = 0;
    let totalCorrect = 0;

    childStates.forEach((childState) => {
      const weight = Math.max(childState.totalAttempts, 1); // 至少权重为1
      totalWeight += weight;
      weightedMasterySum += childState.masteryScore * weight;
      totalAttempts += childState.totalAttempts;
      totalCorrect += childState.correctCount;
    });

    const avgMasteryScore = totalWeight > 0 
      ? weightedMasterySum / totalWeight 
      : 50;

    return {
      knowledgePointId: kp.id,
      knowledgePointName: kp.name,
      level: kp.level,
      masteryScore: Math.round(avgMasteryScore * 100) / 100,
      totalAttempts,
      correctCount: totalCorrect,
      childCount: children.length,
    };
  }

  /**
   * 计算掌握度分数
   * 
   * 算法：基于正确率和连续正确次数计算
   * - 基础分数 = 正确率 × 100
   * - 连续正确加成 = min(连续正确次数 × 5, 20)
   * - 最终分数 = min(基础分数 + 加成, 100)
   * 
   * @param state 知识状态
   * @returns 掌握度分数 (0-100)
   */
  private calculateMasteryScore(state: KnowledgeStateEntity): number {
    if (state.totalAttempts === 0) {
      return 50; // 默认分数
    }

    const correctRate = state.correctCount / state.totalAttempts;
    const baseScore = correctRate * 100;
    const consecutiveBonus = Math.min(state.consecutiveCorrect * 5, 20);
    
    return Math.min(Math.round(baseScore + consecutiveBonus), 100);
  }

  /**
   * 计算下次建议复习时间
   * 
   * 简单的遗忘曲线实现：
   * - 掌握度越高，复习间隔越长
   * - 基础间隔 = 1天
   * - 间隔倍数 = 掌握度 / 20（掌握度100时，间隔5天）
   * 
   * @param state 知识状态
   * @returns 下次建议复习时间
   */
  private calculateNextReviewAt(state: KnowledgeStateEntity): Date {
    const baseIntervalDays = 1;
    const multiplier = Math.max(state.masteryScore / 20, 1);
    const intervalDays = baseIntervalDays * multiplier;

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + Math.round(intervalDays));
    
    return nextReview;
  }

  /**
   * 检查用户是否已掌握某知识点
   * 
   * 掌握条件：连续正确次数 >= 3 且 掌握度 >= 80
   * 
   * @param userId 用户ID
   * @param knowledgePointId 知识点ID
   * @returns 是否已掌握
   */
  async isMastered(
    userId: string,
    knowledgePointId: string,
  ): Promise<boolean> {
    const state = await this.getState(userId, knowledgePointId);
    if (!state) {
      return false;
    }
    return state.consecutiveCorrect >= 3 && state.masteryScore >= 80;
  }

  /**
   * 批量更新知识状态（用于批量答题场景）
   * 
   * @param userId 用户ID
   * @param updates 更新列表
   * @returns 更新后的知识状态列表（只包含成功更新的）
   */
  async batchUpdateStates(
    userId: string,
    updates: Array<{ knowledgePointId: string; isCorrect: boolean }>,
  ): Promise<KnowledgeStateEntity[]> {
    const results: KnowledgeStateEntity[] = [];
    
    for (const update of updates) {
      const state = await this.updateState(
        userId,
        update.knowledgePointId,
        update.isCorrect,
      );
      if (state) {
        results.push(state);
      }
    }

    return results;
  }
}
