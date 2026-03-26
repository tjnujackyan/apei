import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';
import { CreateImportJobDto } from './dto/create-import-job.dto';
import { GenerateAiQuestionsDto } from './dto/generate-ai-questions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  createJob(
    @Body() dto: CreateImportJobDto,
    @UploadedFile() file: Express.Multer.File | undefined, // 文件可选（云托管环境通过 fileID 传递）
    @CurrentUser() user: RequestUser,
  ) {
    return this.importsService.createJob(dto, user.userId, file);
  }

  @Post('generate-smart')
  @UseInterceptors(FileInterceptor('file'))
  generateSmart(
    @Body() dto: GenerateAiQuestionsDto,
    @UploadedFile() file: Express.Multer.File | undefined, // 文件可选（云托管环境通过 fileID 传递）
    @CurrentUser() user: RequestUser,
  ) {
    return this.importsService.createAiGenerationJob(dto, user.userId, file);
  }

  @Get()
  listJobs(@CurrentUser() user: RequestUser) {
    return this.importsService.listJobs(user.userId);
  }

  @Get(':id')
  getJob(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.importsService.getJob(id, user.userId);
  }

  /**
   * 获取任务状态和进度（用于前端轮询）
   */
  @Get(':id/status')
  async getJobStatus(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const job = await this.importsService.getJob(id, user.userId);
    
    // 使用数据库中存储的步骤信息
    let currentStep = job.currentStep || 0;
    let stepName = job.stepName || '等待处理';
    let stage = '';
    let message = '';
    
    if (job.status === 'pending') {
      stage = 'pending';
      message = '任务已提交，等待处理...';
      if (currentStep === 0) {
        stepName = '等待处理';
      }
    } else if (job.status === 'processing') {
      stage = 'processing';
      // 根据当前步骤返回对应消息
      if (currentStep === 1) {
        message = '正在识别和解析文件...';
      } else if (currentStep === 2) {
        message = 'AI 正在生成题目，请稍候...';
      } else {
        message = '正在处理中...';
      }
    } else if (job.status === 'completed') {
      currentStep = 2;
      stepName = '完成';
      stage = 'completed';
      message = `导入完成！共 ${job.succeededQuestions} 道题目`;
    } else if (job.status === 'failed') {
      stepName = '失败';
      stage = 'failed';
      message = job.errorMessage || '导入失败';
    }
    
    return {
      jobId: job.id,
      status: job.status,
      stage,
      message,
      currentStep,
      totalSteps: 2,
      stepName,
      totalQuestions: job.totalQuestions,
      succeededQuestions: job.succeededQuestions,
      failedQuestions: job.failedQuestions,
      questionSetId: job.questionSetId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
