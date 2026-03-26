import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuestionEntity } from './entities/question.entity';
import { QuestionSetEntity } from './entities/question-set.entity';
import { KnowledgePointEntity } from '../knowledge-points/entities/knowledge-point.entity';
import { WrongQuestionLogEntity } from '../wrong-notebook/entities/wrong-question-log.entity';

/**
 * 题库迁移服务
 * 用于为现有题目创建知识点记录，统一转换为 UUID 格式
 */
@Injectable()
export class QuestionBankMigrationService {
  private readonly logger = new Logger(QuestionBankMigrationService.name);
  private readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor(
    @InjectRepository(QuestionEntity)
    private readonly questionsRepo: Repository<QuestionEntity>,
    @InjectRepository(QuestionSetEntity)
    private readonly setsRepo: Repository<QuestionSetEntity>,
    @InjectRepository(KnowledgePointEntity)
    private readonly kpRepo: Repository<KnowledgePointEntity>,
    @InjectRepository(WrongQuestionLogEntity)
    private readonly wrongLogRepo: Repository<WrongQuestionLogEntity>,
  ) {}

  /**
   * 完整迁移：将所有非 UUID 格式的知识点 ID 转换为 UUID
   * 包括 questions 表和 wrong_question_logs 表
   */
  async migrateAll(userId: string): Promise<{
    questions: { total: number; migrated: number; skipped: number; errors: number };
    wrongLogs: { total: number; migrated: number; skipped: number; errors: number };
    knowledgePointsCreated: number;
  }> {
    this.logger.log(`Starting full migration for user: ${userId}`);

    // 1. 迁移题目
    const questionsResult = await this.migrateUserQuestions(userId);

    // 2. 迁移错题记录
    const wrongLogsResult = await this.migrateUserWrongLogs(userId);

    // 3. 统计创建的知识点数量
    const knowledgePointsCreated = await this.kpRepo.count({
      where: { createdBy: userId },
    });

    return {
      questions: questionsResult,
      wrongLogs: wrongLogsResult,
      knowledgePointsCreated,
    };
  }

  /**
   * 为指定用户的题目创建知识点记录
   */
  async migrateUserQuestions(userId: string): Promise<{
    total: number;
    migrated: number;
    skipped: number;
    errors: number;
  }> {
    this.logger.log(`Starting question migration for user: ${userId}`);

    // 获取用户的所有题库
    const questionSets = await this.setsRepo.find({
      where: { ownerId: userId },
    });

    if (questionSets.length === 0) {
      return { total: 0, migrated: 0, skipped: 0, errors: 0 };
    }

    const questionSetIds = questionSets.map(qs => qs.id);

    // 获取这些题库中的所有题目
    const questions = await this.questionsRepo
      .createQueryBuilder('q')
      .where('q.questionSetId IN (:...ids)', { ids: questionSetIds })
      .getMany();

    this.logger.log(`Found ${questions.length} questions to check for user ${userId}`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    // 构建题库ID到题库的映射
    const questionSetMap = new Map(questionSets.map(qs => [qs.id, qs]));

    for (const question of questions) {
      try {
        // 检查是否需要迁移
        const needsMigration = this.needsKnowledgePointMigration(question);
        
        if (!needsMigration) {
          skipped++;
          continue;
        }

        const questionSet = questionSetMap.get(question.questionSetId);
        const subject = questionSet?.subject;

        // 收集所有需要转换的标签（来自 knowledgeTags 和非 UUID 的 knowledgePointIds）
        const tagsToConvert = new Set<string>();
        
        // 添加 knowledgeTags
        if (question.knowledgeTags) {
          question.knowledgeTags.forEach(tag => {
            if (tag && tag.trim()) tagsToConvert.add(tag.trim());
          });
        }
        
        // 添加非 UUID 格式的 knowledgePointIds
        if (question.knowledgePointIds) {
          question.knowledgePointIds.forEach(kpId => {
            if (kpId && !this.UUID_REGEX.test(kpId)) {
              tagsToConvert.add(kpId.trim());
            }
          });
        }

        if (tagsToConvert.size === 0) {
          skipped++;
          continue;
        }

        // 转换为 UUID
        const newKnowledgePointIds = await this.convertTagsToUUIDs(
          Array.from(tagsToConvert),
          subject,
          userId,
        );

        // 保留已有的有效 UUID
        const existingValidUUIDs = (question.knowledgePointIds || [])
          .filter(kpId => this.UUID_REGEX.test(kpId));

        // 合并并去重
        const finalKnowledgePointIds = [...new Set([...existingValidUUIDs, ...newKnowledgePointIds])];

        if (finalKnowledgePointIds.length > 0) {
          question.knowledgePointIds = finalKnowledgePointIds;
          await this.questionsRepo.save(question);
          migrated++;
        } else {
          skipped++;
        }
      } catch (error) {
        this.logger.error(`Failed to migrate question ${question.id}: ${error.message}`);
        errors++;
      }
    }

    this.logger.log(`Question migration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);

    return {
      total: questions.length,
      migrated,
      skipped,
      errors,
    };
  }

  /**
   * 迁移用户的错题记录
   */
  async migrateUserWrongLogs(userId: string): Promise<{
    total: number;
    migrated: number;
    skipped: number;
    errors: number;
  }> {
    this.logger.log(`Starting wrong log migration for user: ${userId}`);

    const wrongLogs = await this.wrongLogRepo.find({
      where: { userId },
    });

    if (wrongLogs.length === 0) {
      return { total: 0, migrated: 0, skipped: 0, errors: 0 };
    }

    this.logger.log(`Found ${wrongLogs.length} wrong logs to check for user ${userId}`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const log of wrongLogs) {
      try {
        // 检查是否有非 UUID 格式的知识点 ID
        const nonUuidKpIds = (log.knowledgePointIds || [])
          .filter(kpId => kpId && !this.UUID_REGEX.test(kpId));

        if (nonUuidKpIds.length === 0) {
          skipped++;
          continue;
        }

        // 获取题目信息以获取科目
        const question = await this.questionsRepo.findOne({
          where: { id: log.questionId },
        });
        
        let subject: string | undefined;
        if (question) {
          const questionSet = await this.setsRepo.findOne({
            where: { id: question.questionSetId },
          });
          subject = questionSet?.subject;
        }

        // 转换非 UUID 的知识点 ID 为 UUID
        const newKnowledgePointIds = await this.convertTagsToUUIDs(
          nonUuidKpIds,
          subject,
          userId,
        );

        // 保留已有的有效 UUID
        const existingValidUUIDs = (log.knowledgePointIds || [])
          .filter(kpId => this.UUID_REGEX.test(kpId));

        // 合并并去重
        const finalKnowledgePointIds = [...new Set([...existingValidUUIDs, ...newKnowledgePointIds])];

        log.knowledgePointIds = finalKnowledgePointIds;
        await this.wrongLogRepo.save(log);
        migrated++;
      } catch (error) {
        this.logger.error(`Failed to migrate wrong log ${log.id}: ${error.message}`);
        errors++;
      }
    }

    this.logger.log(`Wrong log migration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);

    return {
      total: wrongLogs.length,
      migrated,
      skipped,
      errors,
    };
  }

  /**
   * 检查题目是否需要知识点迁移
   */
  private needsKnowledgePointMigration(question: QuestionEntity): boolean {
    // 如果有 knowledgeTags 但没有对应的 knowledgePointIds
    if (question.knowledgeTags && question.knowledgeTags.length > 0) {
      if (!question.knowledgePointIds || question.knowledgePointIds.length === 0) {
        return true;
      }
    }

    // 如果 knowledgePointIds 中有非 UUID 格式的值
    if (question.knowledgePointIds) {
      const hasNonUuid = question.knowledgePointIds.some(
        kpId => kpId && !this.UUID_REGEX.test(kpId)
      );
      if (hasNonUuid) {
        return true;
      }
    }

    return false;
  }

  /**
   * 将标签名转换为 UUID（查找或创建知识点）
   */
  private async convertTagsToUUIDs(
    tags: string[],
    subject: string | undefined,
    userId: string,
  ): Promise<string[]> {
    const uuids: string[] = [];

    for (const tag of tags) {
      if (!tag || tag.trim() === '') continue;

      const trimmedTag = tag.trim();

      // 查找是否已存在
      const queryBuilder = this.kpRepo.createQueryBuilder('kp')
        .where('kp.name = :name', { name: trimmedTag })
        .andWhere('kp.isActive = :isActive', { isActive: true });

      if (subject) {
        queryBuilder.andWhere('kp.subjectCode = :subjectCode', { subjectCode: subject });
      } else {
        queryBuilder.andWhere('kp.subjectCode IS NULL');
      }

      let kp = await queryBuilder.getOne();

      // 如果不存在，创建新的
      if (!kp) {
        kp = this.kpRepo.create({
          name: trimmedTag,
          level: 3,
          subjectCode: subject || undefined,
          isActive: true,
          createdBy: userId,
          metadata: {
            tags: [trimmedTag],
          },
        });
        kp = await this.kpRepo.save(kp);
        this.logger.debug(`Created knowledge point: ${trimmedTag} (${kp.id})`);
      }

      uuids.push(kp.id);
    }

    return uuids;
  }
}
