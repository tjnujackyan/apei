import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { UserGoalEntity } from '../entities/user-goal.entity';

/**
 * 目标跟踪服务
 * ✅ 阶段三优化：实现Manus式的目标复述机制
 * 
 * 通过将目标"复述"到上下文末尾，确保AI在长对话中始终记得用户的目标
 */
@Injectable()
export class GoalTrackingService {
  private readonly logger = new Logger(GoalTrackingService.name);

  constructor(
    @InjectRepository(UserGoalEntity)
    private readonly repo: Repository<UserGoalEntity>,
  ) {}

  /**
   * 添加新目标
   */
  async addGoal(
    userId: string,
    description: string,
    options?: {
      type?: 'study_plan' | 'practice' | 'review' | 'general';
      priority?: number;
      deadline?: Date;
    },
  ): Promise<UserGoalEntity> {
    const goal = this.repo.create({
      userId,
      description,
      type: options?.type || 'general',
      priority: options?.priority ?? 5,
      deadline: options?.deadline,
      progress: 0,
      completed: false,
    });

    return this.repo.save(goal);
  }

  /**
   * 获取用户的当前活跃目标（未完成的）
   * 按优先级和创建时间排序
   */
  async getCurrentGoals(userId: string, limit: number = 5): Promise<UserGoalEntity[]> {
    return this.repo.find({
      where: { 
        userId, 
        completed: false 
      },
      order: { 
        priority: 'DESC', 
        createdAt: 'ASC' 
      },
      take: limit,
    });
  }

  /**
   * 获取所有目标（包括已完成的）
   */
  async getAllGoals(userId: string, limit: number = 20): Promise<UserGoalEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { 
        completed: 'ASC',  // 未完成的在前
        priority: 'DESC',
        createdAt: 'DESC',
      },
      take: limit,
    });
  }

  /**
   * 更新目标进度
   */
  async updateProgress(goalId: string, progress: number): Promise<void> {
    const clampedProgress = Math.min(100, Math.max(0, progress));
    
    await this.repo.update(goalId, {
      progress: clampedProgress,
      // 如果进度达到100%，自动标记为完成
      completed: clampedProgress === 100,
      updatedAt: new Date(),
    });
  }

  /**
   * 标记目标为完成/未完成
   */
  async markCompleted(goalId: string, completed: boolean): Promise<void> {
    await this.repo.update(goalId, {
      completed,
      progress: completed ? 100 : undefined,
      updatedAt: new Date(),
    });
  }

  /**
   * 更新目标优先级
   */
  async updatePriority(goalId: string, priority: number): Promise<void> {
    const clampedPriority = Math.min(10, Math.max(0, priority));
    await this.repo.update(goalId, {
      priority: clampedPriority,
      updatedAt: new Date(),
    });
  }

  /**
   * 删除目标
   */
  async deleteGoal(goalId: string): Promise<void> {
    await this.repo.delete(goalId);
  }

  /**
   * ✅ 核心功能：构建目标摘要（用于上下文复述）
   * 类似Manus的todo.md文件，每次对话都会将目标推入上下文末尾
   */
  buildGoalSummary(goals: UserGoalEntity[]): string {
    if (goals.length === 0) {
      return '';
    }

    const lines: string[] = ['[📋 当前学习目标]'];
    
    goals.forEach((goal, index) => {
      const icon = goal.completed ? '✅' : goal.progress > 0 ? '🔄' : '⭕';
      const progressStr = goal.progress > 0 && !goal.completed 
        ? ` (${goal.progress}%)` 
        : '';
      
      lines.push(`${index + 1}. ${icon} ${goal.description}${progressStr}`);
    });

    lines.push(''); // 空行分隔
    
    return lines.join('\n');
  }

  /**
   * 自动清理过期的已完成目标（超过30天）
   */
  async cleanupOldCompletedGoals(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.repo.delete({
      completed: true,
      updatedAt: LessThan(thirtyDaysAgo),
    });

    if (result.affected && result.affected > 0) {
      this.logger.log(`Cleaned up ${result.affected} old completed goals`);
    }

    return result.affected || 0;
  }

  /**
   * 从对话中自动提取并创建目标
   * ✅ 智能识别用户表达的目标意图
   */
  async extractAndCreateGoalsFromMessage(
    userId: string,
    message: string,
  ): Promise<UserGoalEntity[]> {
    const createdGoals: UserGoalEntity[] = [];

    // 简单的规则匹配（实际可以用LLM提取更准确）
    const goalPatterns = [
      /(?:我要|我想|帮我|计划)(.{2,50})/g,
      /(?:目标是|打算)(.{2,50})/g,
      /(\d+天内?.*?完成.*)/g,
    ];

    for (const pattern of goalPatterns) {
      const matches = message.matchAll(pattern);
      for (const match of matches) {
        const description = match[1]?.trim();
        
        if (description && description.length > 5 && description.length < 200) {
          try {
            const goal = await this.addGoal(userId, description, {
              type: 'general',
              priority: 5,
            });
            createdGoals.push(goal);
            this.logger.log(`Auto-extracted goal: ${description}`);
          } catch (error) {
            this.logger.warn(`Failed to create goal: ${error.message}`);
          }
        }
      }
    }

    return createdGoals;
  }

  /**
   * 获取用户目标统计
   */
  async getStats(userId: string): Promise<{
    total: number;
    active: number;
    completed: number;
    averageProgress: number;
  }> {
    const allGoals = await this.repo.find({ where: { userId } });
    
    const active = allGoals.filter(g => !g.completed);
    const completed = allGoals.filter(g => g.completed);
    
    const averageProgress = active.length > 0
      ? Math.round(active.reduce((sum, g) => sum + g.progress, 0) / active.length)
      : 0;

    return {
      total: allGoals.length,
      active: active.length,
      completed: completed.length,
      averageProgress,
    };
  }
}

