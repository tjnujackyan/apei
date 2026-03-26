import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PracticeSessionEntity } from './entities/practice-session.entity';
import { PracticeItemLogEntity } from './entities/practice-item-log.entity';
import { StartSessionDto } from './dto/start-session.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { QuestionBankService } from '../question-bank/question-bank.service';
import { WrongNotebookService } from '../wrong-notebook/wrong-notebook.service';
import { KnowledgeStateService } from '../smart-review/services/knowledge-state.service';
import { ReviewEffectTrackerService, CompletionStats } from '../smart-review/services/review-effect-tracker.service';

@Injectable()
export class PracticeService {
  private readonly logger = new Logger(PracticeService.name);

  constructor(
    @InjectRepository(PracticeSessionEntity)
    private readonly sessionRepo: Repository<PracticeSessionEntity>,
    @InjectRepository(PracticeItemLogEntity)
    private readonly itemRepo: Repository<PracticeItemLogEntity>,
    private readonly questionBank: QuestionBankService,
    private readonly wrongNotebook: WrongNotebookService,
    @Inject(forwardRef(() => KnowledgeStateService))
    private readonly knowledgeStateService: KnowledgeStateService,
    @Inject(forwardRef(() => ReviewEffectTrackerService))
    private readonly reviewEffectTracker: ReviewEffectTrackerService,
  ) {}

  async startSession(dto: StartSessionDto, userId: string) {
    const set = await this.questionBank.getQuestionSet(
      dto.questionSetId,
      userId,
    );
    const session = this.sessionRepo.create({
      userId,
      questionSetId: set.id,
      reviewSessionId: dto.reviewSessionId, // 关联复习会话
      status: 'active',
      totalQuestions: dto.questionIds?.length ?? 0,
    });
    return this.sessionRepo.save(session);
  }

  async submitAnswer(sessionId: string, userId: string, dto: SubmitAnswerDto) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Not your session');
    }

    // 验证 questionId 不能为空
    if (!dto.questionId) {
      this.logger.warn(`submitAnswer called with empty questionId for user ${userId}`);
      throw new BadRequestException('Question ID is required');
    }

    // 获取题目信息以获取知识点
    const question = await this.questionBank.getQuestion(dto.questionId);
    // 优先使用 knowledgePointIds，其次使用 knowledgeTags，最后使用前端传入的
    const knowledgePointIds = question?.knowledgePointIds?.length 
      ? question.knowledgePointIds 
      : (question?.knowledgeTags?.length ? question.knowledgeTags : (dto.knowledgePointIds || []));

    const log = this.itemRepo.create({
      sessionId,
      userId,
      questionId: dto.questionId,
      isCorrect: dto.isCorrect,
      timeSpentSeconds: dto.timeSpentSeconds,
      answerPayload: dto.answerPayload,
    });
    await this.itemRepo.save(log);

    session.totalTimeSeconds += dto.timeSpentSeconds;
    // session.totalQuestions += 1; // Wrong logic, totalQuestions is set at start
    session.answeredCount += 1; // Track progress
    
    if (dto.isCorrect) {
      session.correctCount += 1;
    } else {
      // 记录错题时传入知识点ID
      await this.wrongNotebook.recordWrong(
        userId,
        session.questionSetId,
        dto.questionId,
        undefined, // tags
        knowledgePointIds, // 传入知识点ID
        dto.answerPayload, // lastAnswer
      );
    }

    // 更新知识状态 (Requirement 6.2)
    // 使用题目的知识点或前端传入的知识点
    if (knowledgePointIds.length > 0) {
      try {
        await this.updateKnowledgeStates(userId, knowledgePointIds, dto.isCorrect);
      } catch (error) {
        // 知识状态更新失败不应影响主流程
        this.logger.warn(
          `Failed to update knowledge states for user ${userId}: ${error.message}`,
        );
      }
    }

    return this.sessionRepo.save(session);
  }

  /**
   * 更新用户对知识点的掌握状态
   * 
   * @param userId 用户ID
   * @param knowledgePointIds 知识点ID列表
   * @param isCorrect 是否答对
   * 
   * Requirement 6.2
   */
  private async updateKnowledgeStates(
    userId: string,
    knowledgePointIds: string[],
    isCorrect: boolean,
  ): Promise<void> {
    for (const kpId of knowledgePointIds) {
      await this.knowledgeStateService.updateState(userId, kpId, isCorrect);
    }
    this.logger.log(
      `Updated knowledge states for ${knowledgePointIds.length} knowledge points, isCorrect: ${isCorrect}`,
    );
  }

  async completeSession(sessionId: string, userId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException('Not your session');

    session.status = 'completed';
    const savedSession = await this.sessionRepo.save(session);

    // 如果是复习会话，记录完成情况 (Requirement 7.1)
    if (session.reviewSessionId) {
      try {
        await this.recordReviewCompletion(session);
      } catch (error) {
        // 复习效果记录失败不应影响主流程
        this.logger.warn(
          `Failed to record review completion for session ${sessionId}: ${error.message}`,
        );
      }
    }

    return savedSession;
  }

  /**
   * 记录复习会话完成情况
   * 
   * @param session 练习会话
   * 
   * Requirement 7.1
   */
  private async recordReviewCompletion(
    session: PracticeSessionEntity,
  ): Promise<void> {
    if (!session.reviewSessionId) {
      return;
    }

    // 获取本次会话的所有答题记录
    const logs = await this.itemRepo.find({
      where: { sessionId: session.id },
    });

    // 构建完成统计数据
    const stats: CompletionStats = {
      answeredCount: session.answeredCount,
      correctCount: session.correctCount,
      totalTimeSeconds: session.totalTimeSeconds,
      // 注意：这里没有详细的题目结果，因为 PracticeItemLogEntity 没有存储知识点信息
      // 如果需要更详细的追踪，可以在 submitAnswer 时收集
    };

    await this.reviewEffectTracker.recordCompletion(
      session.reviewSessionId,
      stats,
    );

    this.logger.log(
      `Recorded review completion for session ${session.id}, reviewSession ${session.reviewSessionId}`,
    );
  }

  async getSessionDetail(sessionId: string, userId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException('Not your session');

    const logs = await this.itemRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    return { ...session, logs };
  }

  listSessions(userId: string) {
    return this.sessionRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取用户练习统计
   */
  async getUserStats(userId: string): Promise<{
    totalAnswered: number;
    correctCount: number;
    totalSessions: number;
    totalTimeSeconds: number;
  }> {
    const sessions = await this.sessionRepo.find({ where: { userId } });
    
    let totalAnswered = 0;
    let correctCount = 0;
    let totalTimeSeconds = 0;

    for (const session of sessions) {
      totalAnswered += session.answeredCount || 0;
      correctCount += session.correctCount || 0;
      totalTimeSeconds += session.totalTimeSeconds || 0;
    }

    return {
      totalAnswered,
      correctCount,
      totalSessions: sessions.length,
      totalTimeSeconds,
    };
  }
}
