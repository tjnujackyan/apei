import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { StudyPlanEntity } from './entities/study-plan.entity';
import { StudyTaskEntity } from './entities/study-task.entity';
import { CreateStudyPlanDto } from './dto/create-study-plan.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';

@Injectable()
export class StudyPlansService {
  constructor(
    @InjectRepository(StudyPlanEntity)
    private readonly planRepo: Repository<StudyPlanEntity>,
    @InjectRepository(StudyTaskEntity)
    private readonly taskRepo: Repository<StudyTaskEntity>,
  ) {}

  /**
   * 创建学习计划
   */
  async createPlan(
    dto: CreateStudyPlanDto,
    userId: string,
  ): Promise<StudyPlanEntity> {
    const plan = this.planRepo.create({
      title: dto.title,
      description: dto.description,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      planType: dto.planType,
      subjectCode: dto.subjectCode,
      metadata: dto.metadata,
      userId,
    });

    const savedPlan = await this.planRepo.save(plan);

    // 创建任务
    if (dto.tasks && dto.tasks.length > 0) {
      const tasks = dto.tasks.map((taskDto, index) =>
        this.taskRepo.create({
          title: taskDto.title,
          description: taskDto.description,
          taskDate: new Date(taskDto.taskDate),
          taskType: (taskDto.taskType as any) || 'practice',
          metadata: taskDto.metadata,
          planId: savedPlan.id,
          userId,
          sortOrder: index,
        }),
      );
      await this.taskRepo.save(tasks);
    }

    return this.getPlan(savedPlan.id, userId);
  }

  /**
   * 获取计划详情（含任务）
   */
  async getPlan(planId: string, userId: string): Promise<StudyPlanEntity> {
    const plan = await this.planRepo.findOne({
      where: { id: planId, userId },
      relations: ['tasks'],
    });

    if (!plan) {
      throw new NotFoundException(`Study plan ${planId} not found`);
    }

    // 按日期和排序序号排序任务
    if (plan.tasks) {
      plan.tasks.sort((a, b) => {
        const dateA = a.taskDate instanceof Date ? a.taskDate : new Date(a.taskDate);
        const dateB = b.taskDate instanceof Date ? b.taskDate : new Date(b.taskDate);
        const dateCompare = dateA.getTime() - dateB.getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.sortOrder - b.sortOrder;
      });
    }

    return plan;
  }

  /**
   * 获取用户的所有计划（包含统计信息）
   */
  async getUserPlans(userId: string): Promise<any[]> {
    const plans = await this.planRepo.find({
      where: { userId },
      relations: ['tasks'],
      order: { createdAt: 'DESC' },
    });

    return plans.map(plan => {
      const totalTasks = plan.tasks?.length || 0;
      const completedTasks = plan.tasks?.filter(t => t.status === 'completed').length || 0;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      
      // 计算天数
      const startDate = plan.startDate instanceof Date ? plan.startDate : new Date(plan.startDate);
      const endDate = plan.endDate instanceof Date ? plan.endDate : new Date(plan.endDate);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      const today = new Date();
      const daysPassed = Math.max(0, Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const completedDays = Math.min(daysPassed, totalDays);

      return {
        id: plan.id,
        name: plan.title,  // 前端使用 name
        title: plan.title,
        description: plan.description,
        subjectCode: plan.subjectCode || '综合',
        startDate: plan.startDate,
        endDate: plan.endDate,
        totalDays,
        completedDays,
        progress,
        totalTasks,
        completedTasks,
        planType: plan.planType,
        createdAt: plan.createdAt,
      };
    });
  }

  /**
   * 获取今日任务
   */
  async getTodayTasks(userId: string): Promise<StudyTaskEntity[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.taskRepo.find({
      where: {
        userId,
        taskDate: Between(today, tomorrow),
      },
      order: { sortOrder: 'ASC' },
    });
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(
    taskId: string,
    userId: string,
    dto: UpdateTaskStatusDto,
  ): Promise<StudyTaskEntity> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, userId },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    task.status = dto.status as any;

    if (dto.actualMinutes !== undefined) {
      task.actualMinutes = dto.actualMinutes;
    }

    if (dto.metadata) {
      task.metadata = {
        ...task.metadata,
        ...dto.metadata,
      };
    }

    if (dto.status === 'completed') {
      task.completedAt = new Date();
      // Calculate actual minutes based on duration from creation to completion
      const createdAt = task.createdAt instanceof Date ? task.createdAt : new Date(task.createdAt);
      const durationMs = task.completedAt.getTime() - createdAt.getTime();
      const minutes = Math.ceil(durationMs / (1000 * 60));
      task.actualMinutes = minutes > 0 ? minutes : 1;
    } else if (dto.status === 'pending' || dto.status === 'in_progress') {
      task.completedAt = null;
      // Optionally reset actualMinutes
      task.actualMinutes = 0;
    }

    return this.taskRepo.save(task);
  }

  /**
   * 获取任务统计
   */
  async getTaskStats(userId: string, dateRange?: { start: Date; end: Date }) {
    let query = this.taskRepo
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId });

    if (dateRange) {
      query = query.andWhere('task.taskDate BETWEEN :start AND :end', {
        start: dateRange.start,
        end: dateRange.end,
      });
    }

    const tasks = await query.getMany();

    const stats = {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      skipped: tasks.filter((t) => t.status === 'skipped').length,
      completionRate: 0,
      totalEstimatedMinutes: tasks.reduce(
        (sum, t) => sum + (t.estimatedMinutes || 0),
        0,
      ),
      totalActualMinutes: tasks.reduce(
        (sum, t) => sum + (t.actualMinutes || 0),
        0,
      ),
    };

    if (stats.total > 0) {
      stats.completionRate = Math.round(
        (stats.completed / stats.total) * 100,
      );
    }

    return stats;
  }

  async deleteTask(taskId: string, userId: string): Promise<void> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, userId },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    await this.taskRepo.remove(task);
  }

  async createTask(
    title: string,
    estimatedMinutes: number,
    userId: string,
  ): Promise<StudyTaskEntity> {
    const today = new Date();
    // Default to today
    const task = this.taskRepo.create({
      title,
      estimatedMinutes,
      userId,
      taskDate: today,
      taskType: 'practice',
      sortOrder: 0,
      description: '',
      status: 'pending',
    });
    return this.taskRepo.save(task);
  }

  async getWeeklyCompletionStats(userId: string): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last7Days: { date: string; count: number }[] = [];

    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      // Use local date string
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      last7Days.push({
        date: `${year}-${month}-${day}`,
        count: 0,
      });
    }

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 6);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 1);

    const tasks = await this.taskRepo.find({
      where: {
        userId,
        status: 'completed',
        completedAt: Between(startDate, endDate),
      },
    });

    tasks.forEach((task) => {
      if (task.completedAt) {
        // Adjust to local time if needed, but for now rely on simple date matching
        // Note: completedAt is likely UTC. To match local "buckets", we should ideally convert.
        // But for simplicity, let's assume simple string matching or basic offset.
        // A robust way:
        const d = new Date(task.completedAt);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        const dayStat = last7Days.find((d) => d.date === dateStr);
        if (dayStat) {
          dayStat.count++;
        }
      }
    });

    return last7Days;
  }

  /**
   * 获取历史完成任务列表
   */
  async getTaskHistory(userId: string, limit = 50): Promise<StudyTaskEntity[]> {
    return this.taskRepo.find({
      where: {
        userId,
      },
      order: {
        taskDate: 'DESC',
        completedAt: 'DESC',
      },
      take: limit,
    });
  }

  /**
   * 删除计划
   */
  async deletePlan(planId: string, userId: string): Promise<void> {
    const plan = await this.planRepo.findOne({
      where: { id: planId, userId },
    });

    if (!plan) {
      throw new NotFoundException(`Plan ${planId} not found`);
    }

    await this.planRepo.remove(plan);
  }
}

