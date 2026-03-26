import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import { ReviewQuizGeneratorService, NoReviewContentError } from './services/review-quiz-generator.service';
import { KnowledgeStateService, AggregatedState } from './services/knowledge-state.service';
import { QuestionTransformerService } from './services/question-transformer.service';
import { WeaknessDetectorService } from './services/weakness-detector.service';
import { NewKnowledgeTrackerService } from './services/new-knowledge-tracker.service';
import { ReviewEffectTrackerService } from './services/review-effect-tracker.service';
import { GenerateReviewQuizDto } from './dto/generate-review-quiz.dto';
import { TransformQuestionDto, TransformedQuestionDto } from './dto/transform-question.dto';
import {
  ReviewQuizResultDto,
  ReviewStatusDto,
  KnowledgeStateDto,
} from './dto/review-status.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuestionEntity } from '../question-bank/entities/question.entity';
import { ReviewSessionEntity } from './entities/review-session.entity';

/**
 * 智能复习 API 控制器
 * 
 * 提供复习题库生成、复习状态查询、题目变式生成、知识状态查询等接口
 * 
 * Requirements: 5.1, 5.2, 6.4
 */
@UseGuards(JwtAuthGuard)
@Controller('smart-review')
export class SmartReviewController {
  constructor(
    private readonly reviewQuizGenerator: ReviewQuizGeneratorService,
    private readonly knowledgeStateService: KnowledgeStateService,
    private readonly questionTransformer: QuestionTransformerService,
    private readonly weaknessDetector: WeaknessDetectorService,
    private readonly newKnowledgeTracker: NewKnowledgeTrackerService,
    private readonly reviewEffectTracker: ReviewEffectTrackerService,
    @InjectRepository(QuestionEntity)
    private readonly questionRepo: Repository<QuestionEntity>,
    @InjectRepository(ReviewSessionEntity)
    private readonly reviewSessionRepo: Repository<ReviewSessionEntity>,
  ) {}

  /**
   * POST /smart-review/generate - 生成复习题库
   * 
   * 根据用户的薄弱点和新学知识，自动生成个性化复习题库
   * 
   * Requirements: 5.1, 5.2
   * 
   * @param user 当前用户
   * @param dto 生成参数
   * @returns 复习题库生成结果
   */
  @Post('generate')
  async generateReviewQuiz(
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateReviewQuizDto,
  ): Promise<ReviewQuizResultDto> {
    try {
      return await this.reviewQuizGenerator.generateFromDto(user.userId, dto);
    } catch (error) {
      if (error instanceof NoReviewContentError) {
        throw new HttpException(
          {
            code: 'NO_REVIEW_CONTENT',
            message: error.message,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
  }

  /**
   * GET /smart-review/status - 获取复习状态概览
   * 
   * 返回用户当前的复习状态，包括薄弱点数量、新学知识数量、建议复习题目数等
   * 
   * Requirements: 5.1
   * 
   * @param user 当前用户
   * @returns 复习状态概览
   */
  @Get('status')
  async getReviewStatus(@CurrentUser() user: RequestUser): Promise<ReviewStatusDto> {
    // 获取薄弱点
    const weaknesses = await this.weaknessDetector.detect(user.userId);
    
    // 获取新学知识
    const newKnowledge = await this.newKnowledgeTracker.track(user.userId);
    
    // 获取最近一次复习会话
    const lastSession = await this.reviewSessionRepo.findOne({
      where: { userId: user.userId },
      order: { createdAt: 'DESC' },
    });

    // 计算建议复习题目数
    const weaknessQuestionCount = weaknesses.reduce(
      (sum, w) => sum + w.relatedQuestionIds.length,
      0,
    );
    const newKnowledgeQuestionCount = newKnowledge.reduce(
      (sum, n) => sum + n.questionIds.length,
      0,
    );
    const suggestedCount = Math.min(
      Math.max(
        Math.floor(weaknessQuestionCount * 0.6 + newKnowledgeQuestionCount * 0.4),
        10,
      ),
      30,
    );

    return {
      hasWeakness: weaknesses.length > 0,
      weaknessCount: weaknesses.length,
      topWeaknesses: weaknesses.slice(0, 5),
      hasNewKnowledge: newKnowledge.length > 0,
      newKnowledgeCount: newKnowledge.length,
      lastReviewAt: lastSession?.createdAt || null,
      suggestedReviewCount: suggestedCount,
    };
  }

  /**
   * POST /smart-review/transform - 生成题目变式
   * 
   * 使用 LLM 对指定题目进行变式改写，生成同构题目
   * 
   * Requirements: 5.1
   * 
   * @param user 当前用户
   * @param dto 变式请求参数
   * @returns 变式题结果
   */
  @Post('transform')
  async transformQuestion(
    @CurrentUser() user: RequestUser,
    @Body() dto: TransformQuestionDto,
  ): Promise<TransformedQuestionDto> {
    // 查找原题
    const question = await this.questionRepo.findOne({
      where: { id: dto.questionId },
      relations: ['questionSet'],
    });

    if (!question) {
      throw new HttpException(
        {
          code: 'QUESTION_NOT_FOUND',
          message: '题目不存在',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 验证用户权限（只能变式自己题库中的题目）
    if (question.questionSet?.ownerId !== user.userId) {
      throw new HttpException(
        {
          code: 'FORBIDDEN',
          message: '无权操作此题目',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // 生成变式题
    const transformed = await this.questionTransformer.transform(question);
    return this.questionTransformer.toDto(transformed);
  }

  /**
   * GET /smart-review/knowledge-state - 获取知识状态
   * 
   * 返回用户对各知识点的掌握状态，支持按层级聚合
   * 
   * Requirements: 6.4
   * 
   * @param user 当前用户
   * @param level 知识点层级（可选，1=科目, 2=章节, 3=知识点）
   * @returns 知识状态列表
   */
  @Get('knowledge-state')
  async getKnowledgeState(
    @CurrentUser() user: RequestUser,
    @Query('level') level?: string,
  ): Promise<KnowledgeStateDto[] | AggregatedState[]> {
    // 如果指定了层级，返回聚合状态
    if (level) {
      const levelNum = parseInt(level, 10);
      if (isNaN(levelNum) || levelNum < 1 || levelNum > 3) {
        throw new HttpException(
          {
            code: 'INVALID_LEVEL',
            message: '无效的知识点层级，有效值为 1-3',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      return this.knowledgeStateService.getAggregatedState(user.userId, levelNum);
    }

    // 否则返回所有知识状态
    const states = await this.knowledgeStateService.getAllStates(user.userId);
    
    return states.map((state) => ({
      knowledgePointId: state.knowledgePointId,
      knowledgePointName: state.knowledgePoint?.name || 'Unknown',
      masteryScore: state.masteryScore,
      totalAttempts: state.totalAttempts,
      correctCount: state.correctCount,
      consecutiveCorrect: state.consecutiveCorrect,
      lastPracticeAt: state.lastPracticeAt,
      nextReviewAt: state.nextReviewAt,
    }));
  }
}
