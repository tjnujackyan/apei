import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { WrongQuestionLogEntity } from './entities/wrong-question-log.entity';
import { KnowledgePointEntity } from '../knowledge-points/entities/knowledge-point.entity';
import { QuestionEntity } from '../question-bank/entities/question.entity';
import { QuestionSetEntity } from '../question-bank/entities/question-set.entity';
import {
  WeaknessAnalysisResult,
  WeaknessAnalysisOptions,
} from './dto/weakness-analysis.dto';
import { TreeNode } from './dto/tree-node.dto';

@Injectable()
export class WrongNotebookService {
  private readonly logger = new Logger(WrongNotebookService.name);

  constructor(
    @InjectRepository(WrongQuestionLogEntity)
    private readonly repo: Repository<WrongQuestionLogEntity>,
    @InjectRepository(KnowledgePointEntity)
    private readonly kpRepo: Repository<KnowledgePointEntity>,
    @InjectRepository(QuestionEntity)
    private readonly questionRepo: Repository<QuestionEntity>,
    @InjectRepository(QuestionSetEntity)
    private readonly questionSetRepo: Repository<QuestionSetEntity>,
  ) {}

  async recordWrong(
    userId: string,
    questionSetId: string,
    questionId: string,
    tags?: string[],
    knowledgePointIds?: string[],
    lastAnswer?: any,
  ) {
    // 验证 questionId 不能为空
    if (!questionId) {
      this.logger.warn(`recordWrong called with empty questionId for user ${userId}`);
      return null; // 不记录无效错题
    }

    const existing = await this.repo.findOne({
      where: { userId, questionId },
    });
    if (existing) {
      existing.wrongCount += 1;
      existing.questionSetId = questionSetId;
      if (lastAnswer) {
        existing.lastAnswer = typeof lastAnswer === 'string' ? lastAnswer : JSON.stringify(lastAnswer);
      }
      // Merge tags if provided
      if (tags && tags.length > 0) {
        const currentTags = existing.tags || [];
        existing.tags = Array.from(new Set([...currentTags, ...tags]));
      }
      // Merge knowledge points if provided
      if (knowledgePointIds && knowledgePointIds.length > 0) {
        const currentKPs = existing.knowledgePointIds || [];
        existing.knowledgePointIds = Array.from(
          new Set([...currentKPs, ...knowledgePointIds]),
        );
      }
      return this.repo.save(existing);
    }
    const entity = this.repo.create({
      userId,
      questionSetId,
      questionId,
      wrongCount: 1,
      tags: tags || [],
      knowledgePointIds: knowledgePointIds || [],
      lastAnswer: lastAnswer ? (typeof lastAnswer === 'string' ? lastAnswer : JSON.stringify(lastAnswer)) : undefined,
    });
    return this.repo.save(entity);
  }

  listWrongs(userId: string) {
    return this.repo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async getStats(userId: string) {
    const logs = await this.repo.find({ where: { userId } });
    const tagCounts: Record<string, number> = {};
    const kpCounts: Record<string, number> = {};

    let totalWrong = 0;
    for (const log of logs) {
      totalWrong += log.wrongCount; // 累计总错题次数
      if (log.tags) {
        for (const tag of log.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
      if (log.knowledgePointIds) {
        for (const kp of log.knowledgePointIds) {
          kpCounts[kp] = (kpCounts[kp] || 0) + 1;
        }
      }
    }

    // Sort by count desc
    const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
      
    const sortedKPs = Object.entries(kpCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([kp, count]) => ({ kp, count })); // Keep 'kp' as ID for now

    // Fetch knowledge point details
    const topKpIds = sortedKPs.slice(0, 10).map((item) => item.kp);
    const kpDetails: Array<{
      id: string;
      count: number;
      name: string;
      level?: number;
      subjectCode?: string;
    }> = [];
    
    if (topKpIds.length > 0) {
      const kpEntities = await this.kpRepo.find({
        where: { id: In(topKpIds) },
      });
      const kpMap = new Map(kpEntities.map((k) => [k.id, k]));
      
      for (const item of sortedKPs) {
         const entity = kpMap.get(item.kp);
         if (entity) {
           kpDetails.push({
             id: item.kp,
             count: item.count,
             name: entity.name,
             level: entity.level,
             subjectCode: entity.subjectCode,
           });
         }
      }
    }

    return {
      totalWrong,
      uniqueWrongQuestions: logs.length,
      topTags: sortedTags,
      topKnowledgePoints: kpDetails,
    };
  }

  /**
   * 获取错题完整内容（包含题目详情）用于AI分析
   */
  async getWrongsWithContent(userId: string, limit: number = 20): Promise<Array<{
    id: string;
    stem: string;
    type: string;
    wrongCount: number;
    questionSetTitle?: string;
  }>> {
    const logs = await this.repo.find({
      where: { userId },
      order: { wrongCount: 'DESC', updatedAt: 'DESC' },
      take: limit,
    });

    if (logs.length === 0) return [];

    // 获取题目详情
    const questionIds = logs.map(l => l.questionId).filter(Boolean);
    const questions = questionIds.length > 0 
      ? await this.questionRepo.find({ where: { id: In(questionIds) } })
      : [];
    const questionMap = new Map(questions.map(q => [q.id, q]));

    // 获取题集标题
    const setIds = [...new Set(logs.map(l => l.questionSetId))];
    const sets = await this.questionSetRepo.find({ where: { id: In(setIds) } });
    const setMap = new Map(sets.map(s => [s.id, s]));

    return logs.map(log => {
      const question = questionMap.get(log.questionId);
      const set = setMap.get(log.questionSetId);
      return {
        id: log.id,
        stem: question?.stem || '题目内容丢失',
        type: question?.type || 'unknown',
        wrongCount: log.wrongCount,
        questionSetTitle: set?.title,
      };
    });
  }

  /**
   * 按知识点获取错题列表
   */
  async getWrongsByKnowledgePoint(
    userId: string,
    knowledgePointId: string,
  ): Promise<WrongQuestionLogEntity[]> {
    const logs = await this.repo.createQueryBuilder('log')
      .leftJoinAndSelect('log.question', 'question')
      .where('log.userId = :userId', { userId })
      .orderBy('log.updatedAt', 'DESC')
      .getMany();
      
    return logs.filter(
      (log) =>
        log.knowledgePointIds && log.knowledgePointIds.includes(knowledgePointId),
    );
  }

  async getQuestionSetStats(userId: string) {
    // Get all wrong logs
    const logs = await this.repo.find({ where: { userId } });
    
    if (logs.length === 0) {
      return [];
    }

    // Aggregate by questionSetId
    const setStats = new Map<string, number>();
    logs.forEach(log => {
      setStats.set(log.questionSetId, (setStats.get(log.questionSetId) || 0) + 1);
    });

    const setIds = Array.from(setStats.keys());
    
    // Fetch QuestionSet entities
    const sets = await this.questionSetRepo.find({
      where: { id: In(setIds) }
    });

    return sets.map(set => ({
      ...set,
      wrongCount: setStats.get(set.id) || 0
    }));
  }
  
  /**
   * 按题库获取错题列表
   */
  async getWrongsByQuestionSet(
    userId: string,
    questionSetId: string,
  ): Promise<WrongQuestionLogEntity[]> {
    this.logger.log(`getWrongsByQuestionSet called: userId=${userId}, questionSetId=${questionSetId}`);
    
    const logs = await this.repo.createQueryBuilder('log')
      .leftJoinAndSelect('log.question', 'question')
      .where('log.userId = :userId', { userId })
      .andWhere('log.questionSetId = :questionSetId', { questionSetId })
      .orderBy('log.wrongCount', 'DESC')
      .getMany();
    
    this.logger.log(`getWrongsByQuestionSet: found ${logs.length} logs for set ${questionSetId}`);
    
    // 添加调试日志
    logs.forEach((log, index) => {
      this.logger.log(`Log ${index}: id=${log.id}, questionId=${log.questionId}, question=${log.question ? 'found' : 'null'}`);
    });
    
    return logs;
  }

  /**
   * 获取今日错题
   */
  async getTodayWrongs(userId: string): Promise<WrongQuestionLogEntity[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = await this.repo.createQueryBuilder('log')
      .leftJoinAndSelect('log.question', 'question')
      .where('log.userId = :userId', { userId })
      .andWhere('log.updatedAt >= :today', { today })
      .orderBy('log.wrongCount', 'DESC')
      .getMany();

    this.logger.log(`getTodayWrongs: found ${logs.length} logs`);
    return logs;
  }

  /**
   * 获取知识点错题树（用于可视化）
   * 返回层级结构：科目 -> 章节 -> 知识点
   */
  async getKnowledgePointTree(userId: string): Promise<TreeNode[]> {
    const logs = await this.repo.find({ where: { userId } });

    // 收集所有知识点ID
    const allKpIds = new Set<string>();
    logs.forEach((log) => {
      if (log.knowledgePointIds) {
        log.knowledgePointIds.forEach((id) => allKpIds.add(id));
      }
    });

    if (allKpIds.size === 0) {
      return [];
    }

    // 获取所有相关知识点（包括父节点）
    const kps = await this.kpRepo.find({
      where: { id: In(Array.from(allKpIds)) },
    });

    // 收集所有父节点ID
    const parentIds = new Set<string>();
    kps.forEach((kp) => {
      if (kp.parentId) parentIds.add(kp.parentId);
    });

    // 获取父节点
    let parentKps: KnowledgePointEntity[] = [];
    if (parentIds.size > 0) {
      parentKps = await this.kpRepo.find({
        where: { id: In(Array.from(parentIds)) },
      });
    }

    const allKps = [...kps, ...parentKps];

    // 计算每个知识点的错题数
    const kpWrongCounts = new Map<string, number>();
    logs.forEach((log) => {
      if (log.knowledgePointIds) {
        log.knowledgePointIds.forEach((id) => {
          kpWrongCounts.set(id, (kpWrongCounts.get(id) || 0) + 1);
        });
      }
    });

    // 构建树形结构
    const kpMap = new Map(allKps.map((kp) => [kp.id, kp]));
    const tree: TreeNode[] = [];

    // 找出根节点（科目）
    const rootNodes = allKps.filter((kp) => !kp.parentId && kp.level === 1);

    const buildTree = (node: KnowledgePointEntity): TreeNode => {
      const wrongCount = kpWrongCounts.get(node.id) || 0;
      const children = allKps
        .filter((kp) => kp.parentId === node.id)
        .map((child) => buildTree(child));

      // 子节点错题数累加到父节点
      const totalWrongCount =
        wrongCount + children.reduce((sum, child) => sum + child.wrongCount, 0);

      return {
        id: node.id,
        name: node.name,
        level: node.level,
        subjectCode: node.subjectCode,
        wrongCount: totalWrongCount,
        directWrongCount: wrongCount, // 直接关联的错题数
        children: children.length > 0 ? children : undefined,
      };
    };

    rootNodes.forEach((root) => {
      tree.push(buildTree(root));
    });

    return tree;
  }

  /**
   * 弱项权重分析
   * 识别最需要优先修复的知识点
   */
  async analyzeWeaknesses(
    userId: string,
    options: WeaknessAnalysisOptions = {},
  ): Promise<WeaknessAnalysisResult[]> {
    const {
      minWrongCount = 3,
      topN = 10,
      subjectCode,
      timeRange,
    } = options;

    // 获取错题日志
    let logsQuery = this.repo
      .createQueryBuilder('log')
      .where('log.userId = :userId', { userId });

    if (timeRange?.start) {
      logsQuery = logsQuery.andWhere('log.createdAt >= :start', {
        start: timeRange.start,
      });
    }
    if (timeRange?.end) {
      logsQuery = logsQuery.andWhere('log.createdAt <= :end', {
        end: timeRange.end,
      });
    }

    const logs = await logsQuery.getMany();

    // 统计每个知识点的错题情况
    const kpStats = new Map<
      string,
      {
        wrongCount: number;
        totalAttempts: number;
        lastWrongAt: Date;
        questionIds: Set<string>;
      }
    >();

    logs.forEach((log) => {
      if (log.knowledgePointIds) {
        log.knowledgePointIds.forEach((kpId) => {
          const existing = kpStats.get(kpId) || {
            wrongCount: 0,
            totalAttempts: 0,
            lastWrongAt: log.createdAt,
            questionIds: new Set(),
          };

          existing.wrongCount += log.wrongCount || 1;
          existing.totalAttempts += log.wrongCount || 1; // 简化：假设wrongCount = totalAttempts
          existing.questionIds.add(log.questionId);
          if (log.createdAt > existing.lastWrongAt) {
            existing.lastWrongAt = log.createdAt;
          }

          kpStats.set(kpId, existing);
        });
      }
    });

    // 过滤低频错题
    const filteredKps = Array.from(kpStats.entries()).filter(
      ([_, stats]) => stats.wrongCount >= minWrongCount,
    );

    if (filteredKps.length === 0) {
      return [];
    }

    // 获取知识点详情
    const kpIds = filteredKps.map(([kpId]) => kpId);
    const kpEntities = await this.kpRepo.find({
      where: { id: In(kpIds) },
    });

    if (subjectCode) {
      // 过滤科目
      const filteredKpEntities = kpEntities.filter(
        (kp) => kp.subjectCode === subjectCode,
      );
      if (filteredKpEntities.length === 0) {
        return [];
      }
    }

    const kpMap = new Map(kpEntities.map((kp) => [kp.id, kp]));

    // 计算权重
    const results: WeaknessAnalysisResult[] = [];

    for (const [kpId, stats] of filteredKps) {
      const kp = kpMap.get(kpId);
      if (!kp) continue;

      if (subjectCode && kp.subjectCode !== subjectCode) continue;

      // 错误率
      const errorRate = stats.wrongCount / stats.totalAttempts;

      // 重要度 (基于元数据配置 + 知识点层级)
      const configImportance = kp.metadata?.importance || 50;
      const levelBonus = kp.level === 3 ? 10 : kp.level === 2 ? 5 : 0;
      const importance = Math.min(100, configImportance + levelBonus);

      // 紧迫度 (基于错题数量 + 最近性)
      const countFactor = Math.min(100, (stats.wrongCount / 20) * 100); // 20题为满分
      const daysSinceLastWrong = Math.floor(
        (Date.now() - stats.lastWrongAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      const recencyFactor = daysSinceLastWrong <= 3 ? 30 : daysSinceLastWrong <= 7 ? 20 : 10;
      const urgency = Math.min(100, countFactor * 0.7 + recencyFactor);

      // 综合权重 = 错误率 * 40% + 重要度 * 30% + 紧迫度 * 30%
      const weight =
        errorRate * 100 * 0.4 + importance * 0.3 + urgency * 0.3;

      // 优先级
      let priority: 'critical' | 'high' | 'medium' | 'low';
      if (weight >= 75) priority = 'critical';
      else if (weight >= 60) priority = 'high';
      else if (weight >= 40) priority = 'medium';
      else priority = 'low';

      // 建议专项训练天数
      let suggestedDays = 3; // 默认3天
      if (stats.wrongCount >= 15) suggestedDays = 5;
      else if (stats.wrongCount >= 10) suggestedDays = 4;
      else if (stats.wrongCount <= 5) suggestedDays = 2;

      // 建议练习题数
      const suggestedQuestionCount = Math.min(
        50,
        Math.max(10, stats.wrongCount * 2),
      );

      // 趋势分析 (简化版：仅基于最近错题时间)
      let recentTrend: 'improving' | 'stable' | 'worsening' = 'stable';
      if (daysSinceLastWrong <= 2) recentTrend = 'worsening';
      else if (daysSinceLastWrong >= 14) recentTrend = 'improving';

      results.push({
        knowledgePointId: kpId,
        knowledgePointName: kp.name,
        level: kp.level,
        subjectCode: kp.subjectCode || 'unknown',
        wrongCount: stats.wrongCount,
        totalAttempts: stats.totalAttempts,
        errorRate,
        weight,
        importance,
        urgency,
        priority,
        suggestedDays,
        suggestedQuestionCount,
        lastWrongAt: stats.lastWrongAt,
        recentTrend,
      });
    }

    // 按权重排序，返回topN
    results.sort((a, b) => b.weight - a.weight);
    return results.slice(0, topN);
  }
}
