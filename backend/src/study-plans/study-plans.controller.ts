import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StudyPlansService } from './study-plans.service';
import { CreateStudyPlanDto } from './dto/create-study-plan.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('study-plans')
export class StudyPlansController {
  constructor(private readonly studyPlansService: StudyPlansService) {}

  /**
   * 创建学习计划
   */
  @Post()
  create(@Body() dto: CreateStudyPlanDto, @CurrentUser() user: RequestUser) {
    return this.studyPlansService.createPlan(dto, user.userId);
  }

  /**
   * 获取用户的所有计划
   */
  @Get()
  getUserPlans(@CurrentUser() user: RequestUser) {
    return this.studyPlansService.getUserPlans(user.userId);
  }

  /**
   * 获取今日任务
   */
  @Get('tasks/today')
  getTodayTasks(@CurrentUser() user: RequestUser) {
    return this.studyPlansService.getTodayTasks(user.userId);
  }

  /**
   * 获取任务统计
   */
  @Get('stats/summary')
  getTaskStats(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    let dateRange;
    if (startDate && endDate) {
      dateRange = {
        start: new Date(startDate),
        end: new Date(endDate),
      };
    }
    return this.studyPlansService.getTaskStats(user.userId, dateRange);
  }

  @Get('stats/weekly')
  getWeeklyStats(@CurrentUser() user: RequestUser) {
    return this.studyPlansService.getWeeklyCompletionStats(user.userId);
  }

  /**
   * 获取历史完成任务
   */
  @Get('history')
  getTaskHistory(@CurrentUser() user: RequestUser) {
    return this.studyPlansService.getTaskHistory(user.userId);
  }

  /**
   * 更新任务状态
   */
  @Put('tasks/:taskId/status')
  updateTaskStatus(
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.studyPlansService.updateTaskStatus(taskId, user.userId, dto);
  }

  /**
   * 获取单个计划详情
   */
  @Get(':id')
  getPlan(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.studyPlansService.getPlan(id, user.userId);
  }

  /**
   * 删除计划
   */
  @Delete(':id')
  deletePlan(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.studyPlansService.deletePlan(id, user.userId);
  }

  @Post('tasks')
  createTask(
    @Body() body: { title: string; estimatedMinutes: number },
    @CurrentUser() user: RequestUser,
  ) {
    return this.studyPlansService.createTask(
      body.title,
      body.estimatedMinutes,
      user.userId,
    );
  }

  @Delete('tasks/:taskId')
  deleteTask(@Param('taskId') taskId: string, @CurrentUser() user: RequestUser) {
    return this.studyPlansService.deleteTask(taskId, user.userId);
  }
}

