import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuestionSetEntity } from '../../question-bank/entities/question-set.entity';
import { QuestionEntity } from '../../question-bank/entities/question.entity';
import { ReviewSessionEntity, WeaknessPointSnapshot, NewKnowledgeSnapshot } from '../entities/review-session.entity';
import { WeaknessDetectorService } from './weakness-detector.service';
import { NewKnowledgeTrackerService } from './new-knowledge-tracker.service';
import { QuestionSelectorService, SelectedQuestion } from './question-selector.service';
import { QuestionTransformerService, TransformedQuestion } from './question-transformer.service';
import { GenerateReviewQuizDto } from '../dto/generate-review-quiz.dto';
import { WeaknessPoint, NewKnowledgeItem, ReviewQuizResultDto } from '../dto/review-status.dto';

/**
 * 生成选项接口
 */
export interface GenerateOptions {
  totalCount?: number;
  weaknessRatio?: number;
  newKnowledgeRatio?: number;
  enableTransform?: boolean;
  subjectCode?: string;
}

/**
 * 复习题库生成结果（内部使用）
 */
export interface ReviewQuizResult {
  questionSet: QuestionSetEntity;
  reviewSession: ReviewSessionEntity;
  summary: {
    totalQuestions: number;
    weaknessQuestions: number;
    newKnowledgeQuestions: number;
    transformedQuestions: number;
    coveredKnowledgePoints: string[];
    estimatedMinutes: number;
  };
}

/**
 * 复习题库生成器核心服务
 * 协调各组件生成个性化复习题库
 * 
 * Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */
@Injectable()
export class ReviewQuizGeneratorService {
  private readonly logger = new Logger(ReviewQuizGeneratorService.name);

  // 默认配置
  private readonly DEFAULT_TOTAL_COUNT = 20;
  private readonly DEFAULT_WEAKNESS_RATIO = 0.6;
  private readonly DEFAULT_NEW_KNOWLEDGE_RATIO = 0.4;
  private readonly MINUTES_PER_QUESTION = 2; // 每道题预计用时2分钟

  constructor(
    private readonly weaknessDetector: WeaknessDetectorService,
    private readonly newKnowledgeTracker: NewKnowledgeTrackerService,
    private readonly questionSelector: QuestionSelectorService,
    private readonly questionTransformer: QuestionTransformerService,
    @InjectRepository(QuestionSetEntity)
    private readonly questionSetRepo: Repository<QuestionSetEntity>,
    @InjectRepository(QuestionEntity)
    private readonly questionRepo: Repository<QuestionEntity>,
    @InjectRepository(ReviewSessionEntity)
    private readonly reviewSessionRepo: Repository<ReviewSessionEntity>,
  ) {}

  /**
   * 生成复习题库
   * 
   * 流程：
   * 1. 识别薄弱点
   * 2. 追踪新学知识
   * 3. 筛选候选题目
   * 4. 可选：生成变式题
   * 5. 创建复习题库
   * 6. 创建复习会话记录
   * 7. 返回题库概览
   * 
   * @param userId 用户ID
   * @param options 生成选项
   * @returns 复习题库生成结果
   * 
   * Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
   */
  async generateReviewQuiz(
    userId: string,
    options: GenerateOptions = {},
  ): Promise<ReviewQuizResult> {
    const startTime = Date.now();
    this.logger.log(`Generating review quiz for user: ${userId}`);

    const {
      totalCount = this.DEFAULT_TOTAL_COUNT,
      weaknessRatio = this.DEFAULT_WEAKNESS_RATIO,
      newKnowledgeRatio = this.DEFAULT_NEW_KNOWLEDGE_RATIO,
      enableTransform = false,
      subjectCode,
    } = options;

    // 1. 识别薄弱点 (Requirement 5.2)
    const weaknesses = await this.weaknessDetector.detect(userId);
    this.logger.log(`Found ${weaknesses.length} weakness points`);

    // 2. 追踪新学知识 (Requirement 5.2)
    const newKnowledge = await this.newKnowledgeTracker.track(userId);
    this.logger.log(`Found ${newKnowledge.length} new knowledge items`);

    // 3. 检查是否有可复习的内容 (Requirement 5.7)
    if (weaknesses.length === 0 && newKnowledge.length === 0) {
      throw new NoReviewContentError('暂无需要复习的内容，请继续学习新知识');
    }

    // 4. 筛选候选题目 (Requirement 5.2)
    const selectedQuestions = await this.questionSelector.select(
      userId,
      weaknesses,
      newKnowledge,
      {
        totalCount,
        weaknessRatio,
        newKnowledgeRatio,
      },
    );
    this.logger.log(`Selected ${selectedQuestions.length} questions`);

    // 5. 可选：生成变式题
    let finalQuestions: (SelectedQuestion | TransformedQuestionWithSource)[];
    let transformedCount = 0;

    if (enableTransform && selectedQuestions.length > 0) {
      const transformResults = await this.transformQuestions(selectedQuestions);
      finalQuestions = transformResults.questions;
      transformedCount = transformResults.transformedCount;
    } else {
      finalQuestions = selectedQuestions;
    }

    // 6. 创建复习题库 (Requirement 5.3, 5.4)
    const questionSet = await this.createReviewQuestionSet(
      userId,
      finalQuestions,
      weaknesses,
      newKnowledge,
    );

    // 7. 统计题目来源
    const weaknessQuestionCount = finalQuestions.filter(
      (q) => this.getQuestionSource(q) === 'weakness',
    ).length;
    const newKnowledgeQuestionCount = finalQuestions.length - weaknessQuestionCount;

    // 8. 收集涵盖的知识点
    const coveredKnowledgePointIds = this.collectCoveredKnowledgePoints(
      weaknesses,
      newKnowledge,
      finalQuestions,
    );
    const coveredKnowledgePointNames = this.getKnowledgePointNames(
      weaknesses,
      newKnowledge,
      coveredKnowledgePointIds,
    );

    // 9. 创建复习会话记录 (Requirement 5.6)
    const reviewSession = await this.createReviewSession(
      userId,
      questionSet.id,
      {
        weaknessRatio,
        newKnowledgeRatio: 1 - weaknessRatio,
        totalCount,
        enableTransform,
      },
      coveredKnowledgePointIds,
      weaknesses,
      newKnowledge,
      {
        originalCount: finalQuestions.length - transformedCount,
        transformedCount,
        weaknessCount: weaknessQuestionCount,
        newKnowledgeCount: newKnowledgeQuestionCount,
      },
      finalQuestions.length,
    );

    // 10. 计算预计用时 (Requirement 5.5)
    const estimatedMinutes = finalQuestions.length * this.MINUTES_PER_QUESTION;

    const elapsedTime = Date.now() - startTime;
    this.logger.log(
      `Review quiz generated in ${elapsedTime}ms: ${finalQuestions.length} questions`,
    );

    // 11. 返回结果 (Requirement 5.5)
    return {
      questionSet,
      reviewSession,
      summary: {
        totalQuestions: finalQuestions.length,
        weaknessQuestions: weaknessQuestionCount,
        newKnowledgeQuestions: newKnowledgeQuestionCount,
        transformedQuestions: transformedCount,
        coveredKnowledgePoints: coveredKnowledgePointNames,
        estimatedMinutes,
      },
    };
  }


  /**
   * 从 DTO 生成复习题库
   * 
   * @param userId 用户ID
   * @param dto 生成请求 DTO
   * @returns 复习题库生成结果 DTO
   */
  async generateFromDto(
    userId: string,
    dto: GenerateReviewQuizDto,
  ): Promise<ReviewQuizResultDto> {
    const result = await this.generateReviewQuiz(userId, {
      totalCount: dto.totalCount,
      weaknessRatio: dto.weaknessRatio,
      enableTransform: dto.enableTransform,
      subjectCode: dto.subjectCode,
    });

    return {
      questionSetId: result.questionSet.id,
      reviewSessionId: result.reviewSession.id,
      summary: result.summary,
    };
  }

  /**
   * 对选中的题目进行变式生成
   * 
   * @param selectedQuestions 选中的题目列表
   * @returns 变式后的题目列表和变式成功数量
   */
  private async transformQuestions(
    selectedQuestions: SelectedQuestion[],
  ): Promise<{
    questions: TransformedQuestionWithSource[];
    transformedCount: number;
  }> {
    const questions: TransformedQuestionWithSource[] = [];
    let transformedCount = 0;

    for (const sq of selectedQuestions) {
      const transformed = await this.questionTransformer.transform(sq.question);
      
      questions.push({
        ...transformed,
        source: sq.source,
        knowledgePointId: sq.knowledgePointId,
        priority: sq.priority,
      });

      if (transformed.isTransformed) {
        transformedCount++;
      }
    }

    return { questions, transformedCount };
  }

  /**
   * 创建复习题库
   * 
   * @param userId 用户ID
   * @param questions 题目列表
   * @param weaknesses 薄弱点列表
   * @param newKnowledge 新学知识列表
   * @returns 创建的题库实体
   * 
   * Requirement 5.3, 5.4
   */
  private async createReviewQuestionSet(
    userId: string,
    questions: (SelectedQuestion | TransformedQuestionWithSource)[],
    weaknesses: WeaknessPoint[],
    newKnowledge: NewKnowledgeItem[],
  ): Promise<QuestionSetEntity> {
    // 构建题库描述，说明复习重点知识点 (Requirement 5.4)
    const description = this.buildQuestionSetDescription(weaknesses, newKnowledge);

    // 创建题库实体，标记来源为 "smart_review" (Requirement 5.3)
    const questionSet = this.questionSetRepo.create({
      title: `智能复习 - ${new Date().toLocaleDateString('zh-CN')}`,
      subject: this.determineSubject(weaknesses, newKnowledge),
      description,
      source: 'ai-generated', // 使用 ai-generated 作为智能复习的来源标记
      ownerId: userId,
    });

    const savedQuestionSet = await this.questionSetRepo.save(questionSet);

    // 创建题目实体
    const questionEntities = questions.map((q) => {
      if (this.isTransformedQuestion(q)) {
        // 变式题
        return this.questionRepo.create({
          questionSetId: savedQuestionSet.id,
          stem: q.stem,
          type: q.type as any,
          options: q.options,
          knowledgeTags: q.knowledgeTags,
          knowledgePointIds: [q.knowledgePointId],
          answerExplanation: q.answerExplanation,
          difficulty: q.difficulty,
        });
      } else {
        // 原题复制
        const sq = q as SelectedQuestion;
        return this.questionRepo.create({
          questionSetId: savedQuestionSet.id,
          stem: sq.question.stem,
          type: sq.question.type,
          options: sq.question.options,
          knowledgeTags: sq.question.knowledgeTags,
          knowledgePointIds: sq.question.knowledgePointIds || [sq.knowledgePointId],
          answerExplanation: sq.question.answerExplanation,
          difficulty: sq.question.difficulty,
        });
      }
    });

    await this.questionRepo.save(questionEntities);

    return savedQuestionSet;
  }

  /**
   * 构建题库描述
   * 
   * @param weaknesses 薄弱点列表
   * @param newKnowledge 新学知识列表
   * @returns 描述字符串
   * 
   * Requirement 5.4
   */
  private buildQuestionSetDescription(
    weaknesses: WeaknessPoint[],
    newKnowledge: NewKnowledgeItem[],
  ): string {
    const parts: string[] = ['本次智能复习题库包含：'];

    if (weaknesses.length > 0) {
      const topWeaknesses = weaknesses.slice(0, 3).map((w) => w.knowledgePointName);
      parts.push(`薄弱知识点：${topWeaknesses.join('、')}`);
    }

    if (newKnowledge.length > 0) {
      const topNewKnowledge = newKnowledge.slice(0, 3).map((n) => n.knowledgePointName);
      parts.push(`新学知识点：${topNewKnowledge.join('、')}`);
    }

    return parts.join('\n');
  }

  /**
   * 确定题库科目
   */
  private determineSubject(
    weaknesses: WeaknessPoint[],
    newKnowledge: NewKnowledgeItem[],
  ): string {
    // 简单实现：返回通用科目
    return '智能复习';
  }

  /**
   * 创建复习会话记录
   * 
   * @param userId 用户ID
   * @param questionSetId 题库ID
   * @param generationParams 生成参数
   * @param coveredKnowledgePointIds 涵盖的知识点ID
   * @param weaknesses 薄弱点列表
   * @param newKnowledge 新学知识列表
   * @param questionSources 题目来源统计
   * @param totalQuestions 总题目数
   * @returns 创建的复习会话实体
   * 
   * Requirement 5.6
   */
  private async createReviewSession(
    userId: string,
    questionSetId: string,
    generationParams: {
      weaknessRatio: number;
      newKnowledgeRatio: number;
      totalCount: number;
      enableTransform: boolean;
    },
    coveredKnowledgePointIds: string[],
    weaknesses: WeaknessPoint[],
    newKnowledge: NewKnowledgeItem[],
    questionSources: {
      originalCount: number;
      transformedCount: number;
      weaknessCount: number;
      newKnowledgeCount: number;
    },
    totalQuestions: number,
  ): Promise<ReviewSessionEntity> {
    // 转换薄弱点为快照格式
    const weaknessSnapshot: WeaknessPointSnapshot[] = weaknesses.map((w) => ({
      knowledgePointId: w.knowledgePointId,
      knowledgePointName: w.knowledgePointName,
      errorRate: w.errorRate,
      errorCount: w.errorCount,
      totalAttempts: w.totalAttempts,
      lastErrorAt: w.lastErrorAt.toISOString(),
      weaknessScore: w.weaknessScore,
      relatedQuestionIds: w.relatedQuestionIds,
    }));

    // 转换新学知识为快照格式
    const newKnowledgeSnapshot: NewKnowledgeSnapshot[] = newKnowledge.map((n) => ({
      knowledgePointId: n.knowledgePointId,
      knowledgePointName: n.knowledgePointName,
      questionCount: n.questionCount,
      practiceCount: n.practiceCount,
      uploadedAt: n.uploadedAt.toISOString(),
      questionIds: n.questionIds,
    }));

    const reviewSession = this.reviewSessionRepo.create({
      userId,
      questionSetId,
      reviewType: 'smart_review',
      generationParams,
      coveredKnowledgePointIds,
      weaknessSnapshot,
      newKnowledgeSnapshot,
      questionSources,
      status: 'pending',
      totalQuestions,
      answeredCount: 0,
      correctCount: 0,
      totalTimeSeconds: 0,
    });

    return this.reviewSessionRepo.save(reviewSession);
  }


  /**
   * 收集涵盖的知识点ID
   */
  private collectCoveredKnowledgePoints(
    weaknesses: WeaknessPoint[],
    newKnowledge: NewKnowledgeItem[],
    questions: (SelectedQuestion | TransformedQuestionWithSource)[],
  ): string[] {
    const kpIds = new Set<string>();

    // 从题目中收集知识点
    questions.forEach((q) => {
      if (this.isTransformedQuestion(q)) {
        kpIds.add(q.knowledgePointId);
      } else {
        const sq = q as SelectedQuestion;
        kpIds.add(sq.knowledgePointId);
      }
    });

    return Array.from(kpIds);
  }

  /**
   * 获取知识点名称列表
   */
  private getKnowledgePointNames(
    weaknesses: WeaknessPoint[],
    newKnowledge: NewKnowledgeItem[],
    kpIds: string[],
  ): string[] {
    const kpNameMap = new Map<string, string>();

    weaknesses.forEach((w) => {
      kpNameMap.set(w.knowledgePointId, w.knowledgePointName);
    });

    newKnowledge.forEach((n) => {
      kpNameMap.set(n.knowledgePointId, n.knowledgePointName);
    });

    return kpIds
      .map((id) => kpNameMap.get(id))
      .filter((name): name is string => !!name);
  }

  /**
   * 获取题目来源
   */
  private getQuestionSource(
    q: SelectedQuestion | TransformedQuestionWithSource,
  ): 'weakness' | 'new_knowledge' {
    if (this.isTransformedQuestion(q)) {
      return q.source;
    }
    return (q as SelectedQuestion).source;
  }

  /**
   * 判断是否为变式题
   */
  private isTransformedQuestion(
    q: SelectedQuestion | TransformedQuestionWithSource,
  ): q is TransformedQuestionWithSource {
    return 'isTransformed' in q;
  }
}

/**
 * 带来源信息的变式题
 */
interface TransformedQuestionWithSource extends TransformedQuestion {
  source: 'weakness' | 'new_knowledge';
  knowledgePointId: string;
  priority: number;
}

/**
 * 无复习内容错误
 * 当用户没有薄弱点和新学知识时抛出
 * 
 * Requirement 5.7
 */
export class NoReviewContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoReviewContentError';
  }
}
