import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, In } from 'typeorm';
import { QuestionSetEntity } from '../../question-bank/entities/question-set.entity';
import { QuestionEntity } from '../../question-bank/entities/question.entity';
import { PracticeItemLogEntity } from '../../practice/entities/practice-item-log.entity';
import { KnowledgePointEntity } from '../../knowledge-points/entities/knowledge-point.entity';
import { NewKnowledgeItem } from '../dto/review-status.dto';

/**
 * 新学知识追踪服务
 * 识别用户最近上传/学习但练习次数少的内容
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.5
 */
@Injectable()
export class NewKnowledgeTrackerService {
  private readonly logger = new Logger(NewKnowledgeTrackerService.name);

  // 默认追踪天数范围
  private readonly DEFAULT_DAYS_RANGE = 7;
  // 练习次数阈值
  private readonly MAX_PRACTICE_COUNT = 1;

  constructor(
    @InjectRepository(QuestionSetEntity)
    private readonly questionSetRepo: Repository<QuestionSetEntity>,
    @InjectRepository(QuestionEntity)
    private readonly questionRepo: Repository<QuestionEntity>,
    @InjectRepository(PracticeItemLogEntity)
    private readonly practiceLogRepo: Repository<PracticeItemLogEntity>,
    @InjectRepository(KnowledgePointEntity)
    private readonly kpRepo: Repository<KnowledgePointEntity>,
  ) {}

  /**
   * 追踪用户的新学知识
   * 
   * 算法逻辑：
   * 1. 获取用户最近 N 天上传的题库
   * 2. 获取这些题库中的所有题目
   * 3. 统计每道题的练习次数
   * 4. 筛选：练习次数 <= 1
   * 5. 提取关联的知识点
   * 
   * @param userId 用户ID
   * @param daysRange 追踪天数范围，默认7天
   * @returns 新学知识列表
   */
  async track(userId: string, daysRange: number = this.DEFAULT_DAYS_RANGE): Promise<NewKnowledgeItem[]> {
    this.logger.log(`Tracking new knowledge for user: ${userId}, daysRange: ${daysRange}`);

    // 1. 计算时间范围
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysRange);

    // 2. 获取用户最近 N 天上传的题库 (Requirement 2.1)
    const recentQuestionSets = await this.questionSetRepo.find({
      where: {
        ownerId: userId,
        createdAt: MoreThanOrEqual(startDate),
      },
    });

    // 如果没有最近上传的题库，返回空列表 (Requirement 2.5)
    if (recentQuestionSets.length === 0) {
      this.logger.log(`No recent question sets found for user: ${userId}`);
      return [];
    }

    const questionSetIds = recentQuestionSets.map((qs) => qs.id);

    // 3. 获取这些题库中的所有题目
    const questions = await this.questionRepo.find({
      where: {
        questionSetId: In(questionSetIds),
      },
    });

    if (questions.length === 0) {
      this.logger.log(`No questions found in recent question sets for user: ${userId}`);
      return [];
    }

    const questionIds = questions.map((q) => q.id);

    // 4. 统计每道题的练习次数
    const practiceCounts = await this.getPracticeCountsByQuestion(userId, questionIds);

    // 5. 筛选练习次数 <= 1 的题目 (Requirement 2.2)
    const lowPracticeQuestions = questions.filter((q) => {
      const count = practiceCounts.get(q.id) || 0;
      return count <= this.MAX_PRACTICE_COUNT;
    });

    if (lowPracticeQuestions.length === 0) {
      this.logger.log(`No low-practice questions found for user: ${userId}`);
      return [];
    }

    // 6. 按知识点聚合 (Requirement 2.3)
    const kpAggregation = this.aggregateByKnowledgePoint(
      lowPracticeQuestions,
      practiceCounts,
      recentQuestionSets,
    );

    // 7. 获取知识点详情
    const kpIds = Array.from(kpAggregation.keys());
    if (kpIds.length === 0) {
      this.logger.log(`No knowledge points found in low-practice questions for user: ${userId}`);
      return [];
    }

    // 过滤出有效的 UUID 格式的知识点ID
    const validUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validKpIds = kpIds.filter(kpId => validUuidRegex.test(kpId));

    let kpMap = new Map<string, KnowledgePointEntity>();
    if (validKpIds.length > 0) {
      const kpEntities = await this.kpRepo.find({
        where: { id: In(validKpIds) },
      });
      kpMap = new Map(kpEntities.map((kp) => [kp.id, kp]));
    }

    // 8. 构建新学知识列表
    const newKnowledgeItems: NewKnowledgeItem[] = Array.from(kpAggregation.entries()).map(
      ([kpId, stats]) => {
        const kp = kpMap.get(kpId);
        return {
          knowledgePointId: kpId,
          knowledgePointName: kp?.name || kpId, // 如果找不到知识点，使用ID作为名称（可能是标签）
          questionCount: stats.questionCount,
          practiceCount: stats.practiceCount,
          uploadedAt: stats.uploadedAt,
          questionIds: stats.questionIds,
        };
      },
    );

    // 9. 按上传时间降序排列（最新的在前）
    newKnowledgeItems.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

    this.logger.log(`Found ${newKnowledgeItems.length} new knowledge items for user: ${userId}`);
    return newKnowledgeItems;
  }

  /**
   * 获取每道题的练习次数
   * 
   * @param userId 用户ID
   * @param questionIds 题目ID列表
   * @returns 题目ID到练习次数的映射
   */
  private async getPracticeCountsByQuestion(
    userId: string,
    questionIds: string[],
  ): Promise<Map<string, number>> {
    const practiceCounts = new Map<string, number>();

    if (questionIds.length === 0) {
      return practiceCounts;
    }

    // 查询用户对这些题目的练习记录
    const practiceLogs = await this.practiceLogRepo.find({
      where: {
        userId,
        questionId: In(questionIds),
      },
    });

    // 统计每道题的练习次数
    practiceLogs.forEach((log) => {
      const count = practiceCounts.get(log.questionId) || 0;
      practiceCounts.set(log.questionId, count + 1);
    });

    return practiceCounts;
  }

  /**
   * 按知识点聚合题目数据
   * 
   * @param questions 题目列表
   * @param practiceCounts 练习次数映射
   * @param questionSets 题库列表
   * @returns 知识点聚合数据
   */
  private aggregateByKnowledgePoint(
    questions: QuestionEntity[],
    practiceCounts: Map<string, number>,
    questionSets: QuestionSetEntity[],
  ): Map<string, {
    questionCount: number;
    practiceCount: number;
    uploadedAt: Date;
    questionIds: string[];
  }> {
    const kpAggregation = new Map<string, {
      questionCount: number;
      practiceCount: number;
      uploadedAt: Date;
      questionIds: string[];
    }>();

    // 构建题库ID到上传时间的映射
    const questionSetUploadMap = new Map(
      questionSets.map((qs) => [qs.id, qs.createdAt]),
    );

    questions.forEach((question) => {
      const kpIds = question.knowledgePointIds || [];
      const practiceCount = practiceCounts.get(question.id) || 0;
      const uploadedAt = questionSetUploadMap.get(question.questionSetId) || question.createdAt;

      kpIds.forEach((kpId) => {
        const existing = kpAggregation.get(kpId) || {
          questionCount: 0,
          practiceCount: 0,
          uploadedAt,
          questionIds: [],
        };

        existing.questionCount += 1;
        existing.practiceCount += practiceCount;
        if (!existing.questionIds.includes(question.id)) {
          existing.questionIds.push(question.id);
        }
        // 使用最新的上传时间
        if (uploadedAt > existing.uploadedAt) {
          existing.uploadedAt = uploadedAt;
        }

        kpAggregation.set(kpId, existing);
      });
    });

    return kpAggregation;
  }

  /**
   * 从题目和练习记录直接追踪新学知识（用于属性测试）
   * 这是一个纯函数，不依赖数据库查询
   * 
   * @param questions 题目列表
   * @param practiceLogs 练习记录
   * @param questionSets 题库列表
   * @param kpMap 知识点映射
   * @param daysRange 追踪天数范围
   * @returns 新学知识列表
   */
  trackFromData(
    questions: QuestionEntity[],
    practiceLogs: PracticeItemLogEntity[],
    questionSets: QuestionSetEntity[],
    kpMap: Map<string, KnowledgePointEntity>,
    daysRange: number = this.DEFAULT_DAYS_RANGE,
  ): NewKnowledgeItem[] {
    // 1. 计算时间范围
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysRange);

    // 2. 筛选最近 N 天上传的题库
    const recentQuestionSets = questionSets.filter(
      (qs) => qs.createdAt >= startDate,
    );

    if (recentQuestionSets.length === 0) {
      return [];
    }

    const questionSetIds = new Set(recentQuestionSets.map((qs) => qs.id));

    // 3. 筛选这些题库中的题目
    const recentQuestions = questions.filter((q) =>
      questionSetIds.has(q.questionSetId),
    );

    if (recentQuestions.length === 0) {
      return [];
    }

    // 4. 统计每道题的练习次数
    const practiceCounts = new Map<string, number>();
    practiceLogs.forEach((log) => {
      const count = practiceCounts.get(log.questionId) || 0;
      practiceCounts.set(log.questionId, count + 1);
    });

    // 5. 筛选练习次数 <= 1 的题目
    const lowPracticeQuestions = recentQuestions.filter((q) => {
      const count = practiceCounts.get(q.id) || 0;
      return count <= this.MAX_PRACTICE_COUNT;
    });

    if (lowPracticeQuestions.length === 0) {
      return [];
    }

    // 6. 按知识点聚合
    const kpAggregation = this.aggregateByKnowledgePoint(
      lowPracticeQuestions,
      practiceCounts,
      recentQuestionSets,
    );

    // 7. 构建新学知识列表
    const newKnowledgeItems: NewKnowledgeItem[] = Array.from(kpAggregation.entries()).map(
      ([kpId, stats]) => {
        const kp = kpMap.get(kpId);
        return {
          knowledgePointId: kpId,
          knowledgePointName: kp?.name || 'Unknown',
          questionCount: stats.questionCount,
          practiceCount: stats.practiceCount,
          uploadedAt: stats.uploadedAt,
          questionIds: stats.questionIds,
        };
      },
    );

    // 8. 按上传时间降序排列
    newKnowledgeItems.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

    return newKnowledgeItems;
  }
}
