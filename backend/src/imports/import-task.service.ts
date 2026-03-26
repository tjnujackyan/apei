import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImportJobEntity } from './entities/import-job.entity';
import { QuestionBankService } from '../question-bank/question-bank.service';
import { FileParserService } from './file-parser.service';
import { QuestionParserService } from './question-parser.service';
import { AiBrainService } from '../ai-brain/ai-brain.service';
import { CloudStorageService } from './cloud-storage.service';
import { STORAGE_SERVICE } from './storage.interface';
import type { IStorageService } from './storage.interface';
import { ImportProgressGateway } from './import-progress.gateway';
import type { ImportProgress } from './import-progress.gateway';

interface ImportTaskPayload {
  userId: string;
  jobId: string;
  fileBuffer?: Buffer;
  fileMimetype?: string;
  fileOriginalName: string;
  fileID?: string;
  questionSetTitle: string;
  subject: string;
  count?: number;
  types?: string[];
  difficulty?: number;
  mode: 'direct' | 'smart'; // direct: 直接导入, smart: AI智能生成
}

@Injectable()
export class ImportTaskService {
  private readonly logger = new Logger(ImportTaskService.name);
  private taskQueue: ImportTaskPayload[] = [];
  private isProcessing = false;

  constructor(
    @InjectRepository(ImportJobEntity)
    private readonly repo: Repository<ImportJobEntity>,
    private readonly questionBankService: QuestionBankService,
    private readonly fileParserService: FileParserService,
    private readonly questionParserService: QuestionParserService,
    private readonly aiBrainService: AiBrainService,
    private readonly cloudStorageService: CloudStorageService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly progressGateway: ImportProgressGateway,
  ) {
    // 延迟启动队列处理，确保所有依赖都已初始化
    setImmediate(() => {
      this.logger.log('ImportTaskService initialized and ready to process tasks');
    });
  }

  /**
   * 添加导入任务到队列
   */
  async enqueueTask(payload: ImportTaskPayload): Promise<void> {
    this.taskQueue.push(payload);
    this.logger.log(`Task enqueued for job ${payload.jobId}, queue size: ${this.taskQueue.length}`);
    
    // 触发队列处理
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * 处理队列中的任务
   */
  private async processQueue() {
    if (this.isProcessing || this.taskQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift()!;
      
      try {
        await this.executeTask(task);
      } catch (error) {
        this.logger.error(`Task execution failed for job ${task.jobId}`, error);
        await this.handleTaskError(task, error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * 执行单个导入任务
   */
  private async executeTask(task: ImportTaskPayload) {
    const { userId, jobId, mode } = task;

    this.logger.log(`Starting task execution for job ${jobId}`);

    // 更新任务状态为processing
    await this.repo.update(jobId, { status: 'processing' as any });

    // 步骤1: 导入识别流程（MinerU 解析）
    await this.updateJobStep(jobId, 1, '导入识别');
    this.sendProgress(
      userId, 
      jobId, 
      'parsing', 
      0, 
      '正在识别和解析文件内容...',
      1,
      '导入识别'
    );
    
    const fileContent = await this.getFileContent(task);
    
    const rawText = await this.fileParserService.parseFile(
      fileContent.buffer,
      fileContent.mimetype,
      fileContent.originalname,
    );

    if (!rawText || rawText.length < 10) {
      throw new Error('文件内容过短或解析失败');
    }

    this.sendProgress(
      userId, 
      jobId, 
      'parsing', 
      0, 
      '文件识别完成，准备生成题目...',
      1,
      '导入识别'
    );

    // 步骤2: 生题流程（AI 生成）
    await this.updateJobStep(jobId, 2, '生题处理');
    let questions: any[] = [];
    let usedFallback = false;
    
    if (mode === 'smart') {
      // AI智能生成模式
      this.sendProgress(
        userId, 
        jobId, 
        'generating', 
        0, 
        'AI 正在分析内容并生成题目，请稍候...',
        2,
        '生题处理'
      );
      
      try {
        questions = await this.aiBrainService.generateQuestionsFromText(
          rawText,
          task.count || 20,
          task.types || ['single', 'multiple'],
          task.difficulty || 1,
        );
      } catch (error) {
        this.logger.warn(`AI generation failed in smart mode, will use fallback: ${error.message}`);
        // Smart 模式失败就直接抛出错误，不使用 fallback
        throw error;
      }
    } else {
      // 直接导入模式（优先AI，失败时使用规则解析器）
      this.sendProgress(
        userId, 
        jobId, 
        'generating', 
        0, 
        'AI 正在提取并标准化题目...',
        2,
        '生题处理'
      );
      
      // 检测题目类型
      const optionPattern = /(\n|^)[A-Da-d][\.|．|、|\)|）]\s*/;
      const tfPattern = /(判断题|对错|对|错)/;
      const types: string[] = [];
      if (optionPattern.test(rawText)) {
        types.push('single', 'multiple');
      }
      if (tfPattern.test(rawText)) {
        types.push('true_false');
      }
      if (types.length === 0) {
        types.push('single');
      }
      
      // 估算题目数量
      const blockCount = (rawText.match(/\n(?=\d+[\.、]\s*)/g) || []).length;
      const desiredCount = Math.max(5, Math.min(50, blockCount || 20));
      
      try {
        questions = await this.aiBrainService.generateQuestionsFromText(
          rawText,
          desiredCount,
          types,
          1,
        );
      } catch (aiError) {
        this.logger.warn(`AI parsing failed, trying rule-based parser as fallback: ${aiError.message}`);
        
        // Fallback: 使用规则解析器
        this.sendProgress(
          userId, 
          jobId, 
          'generating', 
          0, 
          '使用备用解析器处理...',
          2,
          '生题处理'
        );
        
        questions = this.questionParserService.parse(rawText);
        usedFallback = true;
        
        if (questions.length === 0) {
          throw new Error('AI和规则解析器都未能提取到题目，请检查文件格式');
        }
        
        this.logger.log(`Fallback parser extracted ${questions.length} questions`);
      }
    }

    if (questions.length === 0) {
      this.logger.error(`AI failed to generate questions. Raw text length: ${rawText.length}, Mode: ${mode}`);
      throw new Error('AI未能生成题目，请检查文件格式或重试');
    }
    
    this.logger.log(`Successfully generated ${questions.length} questions for job ${jobId}`);

    this.sendProgress(
      userId,
      jobId,
      'generating',
      0,
      `生成完成，共 ${questions.length} 道题目，正在保存...`,
      2,
      '生题处理',
      questions.length,
    );

    // 步骤3: 保存到数据库（快速，不单独显示步骤）
    this.sendProgress(
      userId, 
      jobId, 
      'saving', 
      0, 
      '正在保存题目到题库...',
      2,
      '生题处理'
    );

    const set = await this.questionBankService.createQuestionSet(
      {
        title: task.questionSetTitle,
        subject: task.subject,
        description: `${mode === 'smart' ? 'AI生成' : (usedFallback ? '规则解析' : 'AI导入')} from ${fileContent.originalname}`,
        source: mode === 'smart' ? 'ai-generated' : 'imported',
      },
      userId,
    );

    // 批量创建题目（优化数据库操作）
    const savedQuestions = await this.batchCreateQuestions(
      set.id,
      questions,
      userId,
      (current, total) => {
        const progress = 80 + Math.floor((current / total) * 15);
        this.sendProgress(
          userId,
          jobId,
          'saving',
          progress,
          `正在保存题目 ${current}/${total}`,
        );
      },
    );

    // 完成
    await this.repo.update(jobId, {
      status: 'completed',
      totalQuestions: questions.length,
      succeededQuestions: savedQuestions.length,
      failedQuestions: questions.length - savedQuestions.length,
      questionSetId: set.id,
    });

    this.sendProgress(
      userId,
      jobId,
      'completed',
      0,
      `导入完成！共 ${savedQuestions.length} 道题目`,
      2,
      '完成',
      savedQuestions.length,
    );

    this.logger.log(`Task completed for job ${jobId}: ${savedQuestions.length} questions saved`);
  }

  /**
   * 批量创建题目（优化版）
   */
  private async batchCreateQuestions(
    setId: string,
    questions: any[],
    userId: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<any[]> {
    const saved: any[] = [];
    const batchSize = 10; // 每批处理10道题

    for (let i = 0; i < questions.length; i += batchSize) {
      const batch = questions.slice(i, i + batchSize);
      
      // 并发创建一批题目
      const batchResults = await Promise.allSettled(
        batch.map((question) =>
          this.questionBankService.createQuestion(setId, question, userId),
        ),
      );

      // 统计成功的题目
      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          saved.push(result.value);
        } else {
          this.logger.warn(
            `Failed to save question ${i + idx + 1}: ${result.reason}`,
          );
        }
      });

      // 报告进度（不再使用，保留接口兼容性）
      if (onProgress) {
        onProgress(Math.min(i + batchSize, questions.length), questions.length);
      }
    }

    return saved;
  }

  /**
   * 获取文件内容
   */
  private async getFileContent(task: ImportTaskPayload): Promise<{
    buffer: Buffer;
    mimetype: string;
    originalname: string;
  }> {
    // 如果有直接的buffer
    if (task.fileBuffer) {
      return {
        buffer: task.fileBuffer,
        mimetype: task.fileMimetype || 'application/octet-stream',
        originalname: task.fileOriginalName,
      };
    }

    // 根据文件名推断 mimetype 的辅助函数
    const getMimetype = (fname: string) => {
      const ext = fname.split('.').pop()?.toLowerCase() || '';
      if (ext === 'pdf') return 'application/pdf';
      if (ext === 'doc') return 'application/msword';
      if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (ext === 'txt') return 'text/plain';
      return 'application/octet-stream';
    };

    if (task.fileID) {
      this.logger.log(`Downloading file from fileID: ${task.fileID}`);
      
      // 优先处理 cloud:// 格式的 fileID（仅微信云，小程序端 wx.cloud.uploadFile 上传的）
      if (this.storage.isCloudFileID?.(task.fileID)) {
        this.logger.log(`Using storage for cloud:// fileID`);
        const buffer = await this.storage.downloadFileByCloudID!(task.fileID);
        return {
          buffer,
          mimetype: getMimetype(task.fileOriginalName),
          originalname: task.fileOriginalName,
        };
      }
      
      // 处理当前存储的 URL（OSS 或 COS）
      if (this.storage.isValidStorageUrl?.(task.fileID)) {
        this.logger.log(`Using storage for object URL`);
        const buffer = await this.storage.downloadFileByUrl!(task.fileID);
        return {
          buffer,
          mimetype: getMimetype(task.fileOriginalName),
          originalname: task.fileOriginalName,
        };
      }
      
      // 向后兼容：旧的 CloudBase fileID
      if (this.cloudStorageService.isValidFileID(task.fileID)) {
        this.logger.log(`Using CloudStorageService for legacy fileID`);
        const buffer = await this.cloudStorageService.downloadFile(task.fileID);
        return {
          buffer,
          mimetype: getMimetype(task.fileOriginalName),
          originalname: task.fileOriginalName,
        };
      }
    }

    throw new Error('无法获取文件内容: fileID 格式不支持或为空');
  }

  /**
   * 更新任务步骤（写入数据库）
   */
  private async updateJobStep(jobId: string, currentStep: number, stepName: string) {
    await this.repo.update(jobId, {
      currentStep,
      stepName,
    });
    this.logger.debug(`Job ${jobId} updated to step ${currentStep}: ${stepName}`);
  }

  /**
   * 发送进度更新
   */
  private sendProgress(
    userId: string,
    jobId: string,
    stage: ImportProgress['stage'],
    progress: number,
    message: string,
    currentStep?: number,
    stepName?: string,
    totalQuestions?: number,
  ) {
    this.progressGateway.sendProgressToUser(userId, {
      jobId,
      stage,
      progress,
      message,
      currentStep,
      totalSteps: 2, // 固定为2个主要步骤
      stepName,
      totalQuestions,
    });
  }

  /**
   * 处理任务错误
   */
  private async handleTaskError(task: ImportTaskPayload, error: any) {
    const errorMessage = error?.message || '未知错误';
    
    // 更新任务状态
    await this.repo.update(task.jobId, {
      status: 'failed' as any,
      totalQuestions: 0,
      succeededQuestions: 0,
      failedQuestions: 0,
    });

    // 发送错误通知
    this.sendProgress(task.userId, task.jobId, 'failed', 0, errorMessage);
    
    this.logger.error(`Task failed for job ${task.jobId}: ${errorMessage}`, error.stack);
  }
}

