import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateQuestionSetDto } from './dto/create-question-set.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionSetEntity } from './entities/question-set.entity';
import { QuestionEntity } from './entities/question.entity';
import { PracticeSessionEntity } from '../practice/entities/practice-session.entity';
import { ReviewSessionEntity } from '../smart-review/entities/review-session.entity';
import { KnowledgePointEntity } from '../knowledge-points/entities/knowledge-point.entity';

@Injectable()
export class QuestionBankService {
  private readonly logger = new Logger(QuestionBankService.name);

  constructor(
    @InjectRepository(QuestionSetEntity)
    private readonly setsRepo: Repository<QuestionSetEntity>,
    @InjectRepository(QuestionEntity)
    private readonly questionsRepo: Repository<QuestionEntity>,
    @InjectRepository(PracticeSessionEntity)
    private readonly sessionRepo: Repository<PracticeSessionEntity>,
    @InjectRepository(ReviewSessionEntity)
    private readonly reviewSessionRepo: Repository<ReviewSessionEntity>,
    @InjectRepository(KnowledgePointEntity)
    private readonly kpRepo: Repository<KnowledgePointEntity>,
  ) {}

  async getSetStats(setId: string, userId: string) {
    const set = await this.setsRepo.findOne({ where: { id: setId } });
    if (!set) throw new NotFoundException('Question set not found');
    
    // Check ownership or if public? Assuming private for now or just user access
    // if (set.ownerId !== userId) ...

    const totalQuestions = await this.questionsRepo.count({
      where: { questionSetId: setId },
    });

    const sessions = await this.sessionRepo.find({
      where: { questionSetId: setId, userId },
      order: { createdAt: 'DESC' },
    });

    // Filter history to show only completed sessions
    const completedSessions = sessions.filter(s => s.status === 'completed');
    // Find latest active session for resume card
    const activeSession = sessions.find(s => s.status === 'active');

    // Calculate history stats
    const history = completedSessions.map(s => ({
      id: s.id,
      date: s.updatedAt,
      correctCount: s.correctCount,
      totalQuestions: s.totalQuestions, 
      accuracy: s.totalQuestions > 0 ? Math.round((s.correctCount / s.totalQuestions) * 100) : 0,
      status: s.status
    }));

    return {
      set: {
        id: set.id,
        title: set.title,
        subject: set.subject,
        count: totalQuestions,
        source: set.source,
      },
      lastSession: activeSession ? {
        id: activeSession.id,
        status: activeSession.status,
        progress: `${(activeSession as any).answeredCount || 0}/${activeSession.totalQuestions}`, 
        updatedAt: activeSession.updatedAt
      } : null,
      history
    };
  }


  async createQuestionSet(
    dto: CreateQuestionSetDto,
    ownerId: string,
  ): Promise<QuestionSetEntity> {
    const entity = this.setsRepo.create({
      title: dto.title,
      subject: dto.subject,
      description: dto.description,
      ownerId,
      source: dto.source ?? 'manual',
    });
    return this.setsRepo.save(entity);
  }

  listQuestionSets(ownerId: string): Promise<QuestionSetEntity[]> {
    return this.setsRepo.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    }).then(async (sets) => {
      // Manually load count to avoid loading all questions if performance matters,
      // but simpler: use relations or loadRelationCountAndMap
      // Here we just map over them and get count.
      // Better approach: use query builder to select count.
      const result: QuestionSetEntity[] = [];
      for (const set of sets) {
        const count = await this.questionsRepo.count({
          where: { questionSetId: set.id },
        });
        // Dynamically add 'count' property for frontend convenience
        (set as any).count = count;
        result.push(set);
      }
      return result;
    });
  }

  async getQuestionSet(
    id: string,
    ownerId: string,
  ): Promise<QuestionSetEntity> {
    const set = await this.setsRepo.findOne({ where: { id } });
    if (!set) {
      throw new NotFoundException('Question set not found');
    }
    if (set.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this question set');
    }
    return set;
  }

  async deleteQuestionSet(id: string, ownerId: string): Promise<void> {
    const set = await this.setsRepo.findOne({ where: { id } });
    if (!set) {
      throw new NotFoundException('Question set not found');
    }
    if (set.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this question set');
    }
    
    // 先删除关联的 review_sessions（智能复习会话）
    await this.reviewSessionRepo.delete({ questionSetId: id });
    
    // 再删除题库
    await this.setsRepo.remove(set);
  }

  async createQuestion(
    setId: string,
    dto: CreateQuestionDto,
    ownerId: string,
  ): Promise<QuestionEntity> {
    const questionSet = await this.setsRepo.findOne({ where: { id: setId } });
    if (!questionSet) {
      throw new NotFoundException('Question set not found');
    }
    if (questionSet.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this question set');
    }

    // 动态创建知识点并获取UUID
    const knowledgePointIds = await this.ensureKnowledgePoints(
      dto.knowledgeTags || [],
      questionSet.subject,
      ownerId,
    );

    const entity = this.questionsRepo.create({
      questionSetId: setId,
      stem: dto.stem,
      type: dto.type,
      options: dto.options.map((opt) => ({
        label: opt.label,
        content: opt.content,
        isCorrect: opt.isCorrect,
      })),
      knowledgeTags: dto.knowledgeTags,
      knowledgePointIds, // 存储UUID
      answerExplanation: dto.answerExplanation,
      difficulty: dto.difficulty,
    });
    return this.questionsRepo.save(entity);
  }

  /**
   * 确保知识点存在，如果不存在则创建
   * 返回知识点UUID数组
   */
  private async ensureKnowledgePoints(
    tags: string[],
    subject: string | undefined,
    userId: string,
  ): Promise<string[]> {
    if (!tags || tags.length === 0) {
      return [];
    }

    const knowledgePointIds: string[] = [];

    for (const tag of tags) {
      if (!tag || tag.trim() === '') continue;

      const trimmedTag = tag.trim();

      // 先查找是否已存在该知识点（按名称和科目匹配）
      const queryBuilder = this.kpRepo.createQueryBuilder('kp')
        .where('kp.name = :name', { name: trimmedTag })
        .andWhere('kp.isActive = :isActive', { isActive: true });

      if (subject) {
        queryBuilder.andWhere('kp.subjectCode = :subjectCode', { subjectCode: subject });
      } else {
        queryBuilder.andWhere('kp.subjectCode IS NULL');
      }

      let kp = await queryBuilder.getOne();

      // 如果不存在，创建新的知识点
      if (!kp) {
        kp = this.kpRepo.create({
          name: trimmedTag,
          level: 3, // 默认为最细粒度的知识点级别
          subjectCode: subject || undefined,
          isActive: true,
          createdBy: userId,
          metadata: {
            tags: [trimmedTag],
          },
        });
        kp = await this.kpRepo.save(kp);
        this.logger.log(`Created new knowledge point: ${trimmedTag} (${kp.id})`);
      }

      knowledgePointIds.push(kp.id);
    }

    return knowledgePointIds;
  }

  async listQuestions(
    setId: string,
    ownerId: string,
  ): Promise<QuestionEntity[]> {
    const questionSet = await this.setsRepo.findOne({ where: { id: setId } });
    if (!questionSet) {
      throw new NotFoundException('Question set not found');
    }
    if (questionSet.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this question set');
    }
    return this.questionsRepo.find({
      where: { questionSetId: setId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取单个题目（不验证所有权，用于内部服务调用）
   */
  async getQuestion(questionId: string): Promise<QuestionEntity | null> {
    return this.questionsRepo.findOne({ where: { id: questionId } });
  }
}
