import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { QuestionEntity } from '../../question-bank/entities/question.entity';
import { PracticeItemLogEntity } from '../../practice/entities/practice-item-log.entity';
import { WeaknessPoint, NewKnowledgeItem } from '../dto/review-status.dto';

/**
 * 筛选后的题目信息
 */
export interface SelectedQuestion {
  question: QuestionEntity;
  source: 'weakness' | 'new_knowledge';
  knowledgePointId: string;
  priority: number;
}

/**
 * 题目筛选选项
 */
export interface SelectOptions {
  totalCount?: number;
  weaknessRatio?: number;
  newKnowledgeRatio?: number;
  excludeRecentDays?: number;
}

/**
 * 题目筛选服务
 * 基于规则从题库中筛选候选题目
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */
@Injectable()
export class QuestionSelectorService {
  private readonly logger = new Logger(QuestionSelectorService.name);

  // 默认配置
  private readonly DEFAULT_TOTAL_COUNT = 20;
  private readonly DEFAULT_WEAKNESS_RATIO = 0.6;
  private readonly DEFAULT_NEW_KNOWLEDGE_RATIO = 0.4;
  private readonly DEFAULT_EXCLUDE_RECENT_DAYS = 3;
  private readonly MIN_QUESTIONS = 10;
  private readonly MAX_QUESTIONS = 30;

  constructor(
    @InjectRepository(QuestionEntity)
    private readonly questionRepo: Repository<QuestionEntity>,
    @InjectRepository(PracticeItemLogEntity)
    private readonly practiceLogRepo: Repository<PracticeItemLogEntity>,
  ) {}

  /**
   * 筛选复习题目
   * 
   * 算法逻辑：
   * 1. 计算各类题目数量（60% 薄弱点，40% 新学知识）
   * 2. 从薄弱点筛选题目
   * 3. 从新学知识筛选题目
   * 4. 排除最近3天做对的题目
   * 5. 合并并去重
   * 6. 候选不足时执行降级策略
   * 
   * @param userId 用户ID
   * @param weaknesses 薄弱知识点列表
   * @param newKnowledge 新学知识列表
   * @param options 筛选选项
   * @returns 筛选后的题目列表
   */
  async select(
    userId: string,
    weaknesses: WeaknessPoint[],
    newKnowledge: NewKnowledgeItem[],
    options: SelectOptions = {},
  ): Promise<SelectedQuestion[]> {
    const {
      totalCount = this.DEFAULT_TOTAL_COUNT,
      weaknessRatio = this.DEFAULT_WEAKNESS_RATIO,
      newKnowledgeRatio = this.DEFAULT_NEW_KNOWLEDGE_RATIO,
      excludeRecentDays = this.DEFAULT_EXCLUDE_RECENT_DAYS,
    } = options;

    // 限制题目数量在 10-30 题之间 (Requirement 3.6)
    const clampedTotalCount = Math.max(
      this.MIN_QUESTIONS,
      Math.min(this.MAX_QUESTIONS, totalCount),
    );

    this.logger.log(
      `Selecting questions for user: ${userId}, totalCount: ${clampedTotalCount}`,
    );

    // 1. 计算各类题目数量 (Requirement 3.4)
    const weaknessCount = Math.floor(clampedTotalCount * weaknessRatio);
    const newKnowledgeCount = clampedTotalCount - weaknessCount;

    // 2. 获取最近做对的题目ID，用于排除 (Requirement 3.3)
    const recentCorrectQuestionIds = await this.getRecentCorrectQuestionIds(
      userId,
      excludeRecentDays,
    );

    // 3. 从薄弱点筛选题目 (Requirement 3.1)
    const weaknessQuestions = await this.selectFromWeakness(
      weaknesses,
      weaknessCount,
      recentCorrectQuestionIds,
    );

    // 4. 从新学知识筛选题目 (Requirement 3.2)
    const newKnowledgeQuestions = await this.selectFromNewKnowledge(
      newKnowledge,
      newKnowledgeCount,
      recentCorrectQuestionIds,
      weaknessQuestions.map((q) => q.question.id),
    );

    // 5. 合并并去重
    let selectedQuestions = this.mergeAndDedupe(
      weaknessQuestions,
      newKnowledgeQuestions,
    );

    // 6. 候选不足时执行降级策略 (Requirement 3.5)
    if (selectedQuestions.length < this.MIN_QUESTIONS) {
      this.logger.log(
        `Insufficient questions (${selectedQuestions.length}), applying fallback strategy`,
      );
      selectedQuestions = await this.applyFallbackStrategy(
        userId,
        weaknesses,
        newKnowledge,
        selectedQuestions,
        clampedTotalCount,
        excludeRecentDays,
      );
    }

    this.logger.log(`Selected ${selectedQuestions.length} questions for user: ${userId}`);
    return selectedQuestions;
  }

  /**
   * 获取用户最近N天做对的题目ID
   * 
   * @param userId 用户ID
   * @param days 天数
   * @returns 题目ID集合
   */
  private async getRecentCorrectQuestionIds(
    userId: string,
    days: number,
  ): Promise<Set<string>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const recentCorrectLogs = await this.practiceLogRepo.find({
      where: {
        userId,
        isCorrect: true,
        createdAt: MoreThanOrEqual(startDate),
      },
      select: ['questionId'],
    });

    return new Set(recentCorrectLogs.map((log) => log.questionId));
  }

  /**
   * 从薄弱知识点筛选题目
   * 
   * @param weaknesses 薄弱知识点列表
   * @param targetCount 目标数量
   * @param excludeQuestionIds 排除的题目ID
   * @returns 筛选后的题目列表
   */
  private async selectFromWeakness(
    weaknesses: WeaknessPoint[],
    targetCount: number,
    excludeQuestionIds: Set<string>,
  ): Promise<SelectedQuestion[]> {
    if (weaknesses.length === 0 || targetCount <= 0) {
      return [];
    }

    // 收集所有薄弱点关联的题目ID
    const allQuestionIds: string[] = [];
    const questionToKpMap = new Map<string, { kpId: string; priority: number }>();

    weaknesses.forEach((wp, index) => {
      wp.relatedQuestionIds.forEach((qId) => {
        if (!excludeQuestionIds.has(qId) && !questionToKpMap.has(qId)) {
          allQuestionIds.push(qId);
          // 优先级基于薄弱程度排名（越靠前优先级越高）
          questionToKpMap.set(qId, {
            kpId: wp.knowledgePointId,
            priority: weaknesses.length - index,
          });
        }
      });
    });

    if (allQuestionIds.length === 0) {
      return [];
    }

    // 查询题目详情
    const questions = await this.questionRepo.find({
      where: { id: In(allQuestionIds) },
    });

    // 按优先级排序并选取目标数量
    const sortedQuestions = questions
      .map((q) => ({
        question: q,
        source: 'weakness' as const,
        knowledgePointId: questionToKpMap.get(q.id)!.kpId,
        priority: questionToKpMap.get(q.id)!.priority,
      }))
      .sort((a, b) => b.priority - a.priority);

    return sortedQuestions.slice(0, targetCount);
  }

  /**
   * 从新学知识筛选题目
   * 
   * @param newKnowledge 新学知识列表
   * @param targetCount 目标数量
   * @param excludeQuestionIds 排除的题目ID（最近做对的）
   * @param alreadySelectedIds 已选中的题目ID（避免重复）
   * @returns 筛选后的题目列表
   */
  private async selectFromNewKnowledge(
    newKnowledge: NewKnowledgeItem[],
    targetCount: number,
    excludeQuestionIds: Set<string>,
    alreadySelectedIds: string[],
  ): Promise<SelectedQuestion[]> {
    if (newKnowledge.length === 0 || targetCount <= 0) {
      return [];
    }

    const alreadySelectedSet = new Set(alreadySelectedIds);

    // 收集所有新学知识关联的题目ID
    const allQuestionIds: string[] = [];
    const questionToKpMap = new Map<string, { kpId: string; priority: number }>();

    newKnowledge.forEach((nk, index) => {
      nk.questionIds.forEach((qId) => {
        if (
          !excludeQuestionIds.has(qId) &&
          !alreadySelectedSet.has(qId) &&
          !questionToKpMap.has(qId)
        ) {
          allQuestionIds.push(qId);
          // 优先级基于上传时间（越新优先级越高）
          questionToKpMap.set(qId, {
            kpId: nk.knowledgePointId,
            priority: newKnowledge.length - index,
          });
        }
      });
    });

    if (allQuestionIds.length === 0) {
      return [];
    }

    // 查询题目详情
    const questions = await this.questionRepo.find({
      where: { id: In(allQuestionIds) },
    });

    // 按优先级排序并选取目标数量
    const sortedQuestions = questions
      .map((q) => ({
        question: q,
        source: 'new_knowledge' as const,
        knowledgePointId: questionToKpMap.get(q.id)!.kpId,
        priority: questionToKpMap.get(q.id)!.priority,
      }))
      .sort((a, b) => b.priority - a.priority);

    return sortedQuestions.slice(0, targetCount);
  }

  /**
   * 合并并去重题目列表
   * 
   * @param weaknessQuestions 薄弱点题目
   * @param newKnowledgeQuestions 新学知识题目
   * @returns 合并后的题目列表
   */
  private mergeAndDedupe(
    weaknessQuestions: SelectedQuestion[],
    newKnowledgeQuestions: SelectedQuestion[],
  ): SelectedQuestion[] {
    const selectedIds = new Set<string>();
    const result: SelectedQuestion[] = [];

    // 先添加薄弱点题目（优先级更高）
    weaknessQuestions.forEach((sq) => {
      if (!selectedIds.has(sq.question.id)) {
        selectedIds.add(sq.question.id);
        result.push(sq);
      }
    });

    // 再添加新学知识题目
    newKnowledgeQuestions.forEach((sq) => {
      if (!selectedIds.has(sq.question.id)) {
        selectedIds.add(sq.question.id);
        result.push(sq);
      }
    });

    return result;
  }

  /**
   * 候选不足时的降级策略
   * 
   * 策略：
   * 1. 扩大时间范围（从3天扩大到7天）
   * 2. 降低错误率阈值（从40%降低到30%）
   * 3. 从所有关联题目中随机选取
   * 
   * @param userId 用户ID
   * @param weaknesses 薄弱知识点列表
   * @param newKnowledge 新学知识列表
   * @param currentSelection 当前已选题目
   * @param targetCount 目标数量
   * @param originalExcludeDays 原始排除天数
   * @returns 补充后的题目列表
   */
  private async applyFallbackStrategy(
    userId: string,
    weaknesses: WeaknessPoint[],
    newKnowledge: NewKnowledgeItem[],
    currentSelection: SelectedQuestion[],
    targetCount: number,
    originalExcludeDays: number,
  ): Promise<SelectedQuestion[]> {
    const currentIds = new Set(currentSelection.map((sq) => sq.question.id));
    const needed = Math.max(0, this.MIN_QUESTIONS - currentSelection.length);

    if (needed === 0) {
      return currentSelection;
    }

    // 策略1: 扩大时间范围到7天
    const extendedExcludeDays = Math.max(originalExcludeDays, 7);
    const extendedExcludeIds = await this.getRecentCorrectQuestionIds(
      userId,
      extendedExcludeDays,
    );

    // 收集所有可用的题目ID
    const allAvailableQuestionIds: string[] = [];
    const questionToKpMap = new Map<string, string>();

    // 从薄弱点收集
    weaknesses.forEach((wp) => {
      wp.relatedQuestionIds.forEach((qId) => {
        if (!currentIds.has(qId) && !extendedExcludeIds.has(qId)) {
          if (!questionToKpMap.has(qId)) {
            allAvailableQuestionIds.push(qId);
            questionToKpMap.set(qId, wp.knowledgePointId);
          }
        }
      });
    });

    // 从新学知识收集
    newKnowledge.forEach((nk) => {
      nk.questionIds.forEach((qId) => {
        if (!currentIds.has(qId) && !extendedExcludeIds.has(qId)) {
          if (!questionToKpMap.has(qId)) {
            allAvailableQuestionIds.push(qId);
            questionToKpMap.set(qId, nk.knowledgePointId);
          }
        }
      });
    });

    if (allAvailableQuestionIds.length === 0) {
      // 策略2: 如果仍然不足，放宽到包含最近做对的题目
      return this.selectWithRelaxedCriteria(
        weaknesses,
        newKnowledge,
        currentSelection,
        needed,
      );
    }

    // 查询题目详情
    const additionalQuestions = await this.questionRepo.find({
      where: { id: In(allAvailableQuestionIds.slice(0, needed)) },
    });

    // 添加到结果
    const additionalSelected: SelectedQuestion[] = additionalQuestions.map((q) => ({
      question: q,
      source: 'weakness' as const, // 降级策略默认标记为薄弱点
      knowledgePointId: questionToKpMap.get(q.id) || '',
      priority: 0,
    }));

    return [...currentSelection, ...additionalSelected];
  }

  /**
   * 放宽条件筛选题目（最后的降级策略）
   * 
   * @param weaknesses 薄弱知识点列表
   * @param newKnowledge 新学知识列表
   * @param currentSelection 当前已选题目
   * @param needed 需要补充的数量
   * @returns 补充后的题目列表
   */
  private async selectWithRelaxedCriteria(
    weaknesses: WeaknessPoint[],
    newKnowledge: NewKnowledgeItem[],
    currentSelection: SelectedQuestion[],
    needed: number,
  ): Promise<SelectedQuestion[]> {
    const currentIds = new Set(currentSelection.map((sq) => sq.question.id));

    // 收集所有关联题目（不排除任何）
    const allQuestionIds: string[] = [];
    const questionToKpMap = new Map<string, string>();

    weaknesses.forEach((wp) => {
      wp.relatedQuestionIds.forEach((qId) => {
        if (!currentIds.has(qId) && !questionToKpMap.has(qId)) {
          allQuestionIds.push(qId);
          questionToKpMap.set(qId, wp.knowledgePointId);
        }
      });
    });

    newKnowledge.forEach((nk) => {
      nk.questionIds.forEach((qId) => {
        if (!currentIds.has(qId) && !questionToKpMap.has(qId)) {
          allQuestionIds.push(qId);
          questionToKpMap.set(qId, nk.knowledgePointId);
        }
      });
    });

    if (allQuestionIds.length === 0) {
      return currentSelection;
    }

    // 随机打乱并选取
    const shuffled = this.shuffleArray(allQuestionIds);
    const toSelect = shuffled.slice(0, needed);

    const additionalQuestions = await this.questionRepo.find({
      where: { id: In(toSelect) },
    });

    const additionalSelected: SelectedQuestion[] = additionalQuestions.map((q) => ({
      question: q,
      source: 'weakness' as const,
      knowledgePointId: questionToKpMap.get(q.id) || '',
      priority: 0,
    }));

    return [...currentSelection, ...additionalSelected];
  }

  /**
   * 随机打乱数组
   */
  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }


  /**
   * 从数据直接筛选题目（用于属性测试）
   * 这是一个纯函数，不依赖数据库查询
   * 
   * @param questions 所有题目
   * @param practiceLogs 练习记录
   * @param weaknesses 薄弱知识点列表
   * @param newKnowledge 新学知识列表
   * @param options 筛选选项
   * @returns 筛选后的题目列表
   */
  selectFromData(
    questions: QuestionEntity[],
    practiceLogs: PracticeItemLogEntity[],
    weaknesses: WeaknessPoint[],
    newKnowledge: NewKnowledgeItem[],
    options: SelectOptions = {},
  ): SelectedQuestion[] {
    const {
      totalCount = this.DEFAULT_TOTAL_COUNT,
      weaknessRatio = this.DEFAULT_WEAKNESS_RATIO,
      excludeRecentDays = this.DEFAULT_EXCLUDE_RECENT_DAYS,
    } = options;

    // 限制题目数量在 10-30 题之间
    const clampedTotalCount = Math.max(
      this.MIN_QUESTIONS,
      Math.min(this.MAX_QUESTIONS, totalCount),
    );

    // 1. 计算各类题目数量
    const weaknessCount = Math.floor(clampedTotalCount * weaknessRatio);
    const newKnowledgeCount = clampedTotalCount - weaknessCount;

    // 2. 获取最近做对的题目ID
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - excludeRecentDays);
    const recentCorrectQuestionIds = new Set(
      practiceLogs
        .filter((log) => log.isCorrect && log.createdAt >= startDate)
        .map((log) => log.questionId),
    );

    // 3. 构建题目ID到题目的映射
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    // 4. 从薄弱点筛选题目
    const weaknessQuestions = this.selectFromWeaknessData(
      weaknesses,
      weaknessCount,
      recentCorrectQuestionIds,
      questionMap,
    );

    // 5. 从新学知识筛选题目
    const newKnowledgeQuestions = this.selectFromNewKnowledgeData(
      newKnowledge,
      newKnowledgeCount,
      recentCorrectQuestionIds,
      new Set(weaknessQuestions.map((q) => q.question.id)),
      questionMap,
    );

    // 6. 合并并去重
    let selectedQuestions = this.mergeAndDedupe(
      weaknessQuestions,
      newKnowledgeQuestions,
    );

    // 7. 候选不足时执行降级策略
    if (selectedQuestions.length < this.MIN_QUESTIONS) {
      selectedQuestions = this.applyFallbackStrategyFromData(
        weaknesses,
        newKnowledge,
        selectedQuestions,
        recentCorrectQuestionIds,
        questionMap,
      );
    }

    return selectedQuestions;
  }

  /**
   * 从薄弱知识点数据筛选题目（纯函数）
   */
  private selectFromWeaknessData(
    weaknesses: WeaknessPoint[],
    targetCount: number,
    excludeQuestionIds: Set<string>,
    questionMap: Map<string, QuestionEntity>,
  ): SelectedQuestion[] {
    if (weaknesses.length === 0 || targetCount <= 0) {
      return [];
    }

    const result: SelectedQuestion[] = [];
    const selectedIds = new Set<string>();

    for (const wp of weaknesses) {
      if (result.length >= targetCount) break;

      for (const qId of wp.relatedQuestionIds) {
        if (result.length >= targetCount) break;
        if (excludeQuestionIds.has(qId) || selectedIds.has(qId)) continue;

        const question = questionMap.get(qId);
        if (question) {
          selectedIds.add(qId);
          result.push({
            question,
            source: 'weakness',
            knowledgePointId: wp.knowledgePointId,
            priority: weaknesses.length - weaknesses.indexOf(wp),
          });
        }
      }
    }

    return result;
  }

  /**
   * 从新学知识数据筛选题目（纯函数）
   */
  private selectFromNewKnowledgeData(
    newKnowledge: NewKnowledgeItem[],
    targetCount: number,
    excludeQuestionIds: Set<string>,
    alreadySelectedIds: Set<string>,
    questionMap: Map<string, QuestionEntity>,
  ): SelectedQuestion[] {
    if (newKnowledge.length === 0 || targetCount <= 0) {
      return [];
    }

    const result: SelectedQuestion[] = [];
    const selectedIds = new Set<string>();

    for (const nk of newKnowledge) {
      if (result.length >= targetCount) break;

      for (const qId of nk.questionIds) {
        if (result.length >= targetCount) break;
        if (
          excludeQuestionIds.has(qId) ||
          alreadySelectedIds.has(qId) ||
          selectedIds.has(qId)
        )
          continue;

        const question = questionMap.get(qId);
        if (question) {
          selectedIds.add(qId);
          result.push({
            question,
            source: 'new_knowledge',
            knowledgePointId: nk.knowledgePointId,
            priority: newKnowledge.length - newKnowledge.indexOf(nk),
          });
        }
      }
    }

    return result;
  }

  /**
   * 降级策略（纯函数版本）
   */
  private applyFallbackStrategyFromData(
    weaknesses: WeaknessPoint[],
    newKnowledge: NewKnowledgeItem[],
    currentSelection: SelectedQuestion[],
    excludeQuestionIds: Set<string>,
    questionMap: Map<string, QuestionEntity>,
  ): SelectedQuestion[] {
    const currentIds = new Set(currentSelection.map((sq) => sq.question.id));
    const needed = Math.max(0, this.MIN_QUESTIONS - currentSelection.length);

    if (needed === 0) {
      return currentSelection;
    }

    // 收集所有可用的题目（放宽排除条件）
    const additionalQuestions: SelectedQuestion[] = [];

    // 从薄弱点收集
    for (const wp of weaknesses) {
      if (additionalQuestions.length >= needed) break;

      for (const qId of wp.relatedQuestionIds) {
        if (additionalQuestions.length >= needed) break;
        if (currentIds.has(qId)) continue;

        const question = questionMap.get(qId);
        if (question) {
          currentIds.add(qId);
          additionalQuestions.push({
            question,
            source: 'weakness',
            knowledgePointId: wp.knowledgePointId,
            priority: 0,
          });
        }
      }
    }

    // 从新学知识收集
    for (const nk of newKnowledge) {
      if (additionalQuestions.length >= needed) break;

      for (const qId of nk.questionIds) {
        if (additionalQuestions.length >= needed) break;
        if (currentIds.has(qId)) continue;

        const question = questionMap.get(qId);
        if (question) {
          currentIds.add(qId);
          additionalQuestions.push({
            question,
            source: 'new_knowledge',
            knowledgePointId: nk.knowledgePointId,
            priority: 0,
          });
        }
      }
    }

    return [...currentSelection, ...additionalQuestions];
  }
}
