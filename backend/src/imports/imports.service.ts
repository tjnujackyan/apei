import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateImportJobDto } from './dto/create-import-job.dto';
import { GenerateAiQuestionsDto } from './dto/generate-ai-questions.dto';
import { ImportJobEntity, ImportJobStatus } from './entities/import-job.entity';
import { QuestionBankService } from '../question-bank/question-bank.service';
import { FileParserService } from './file-parser.service';
import { QuestionParserService } from './question-parser.service';
import { AiBrainService } from '../ai-brain/ai-brain.service';
import { CloudStorageService } from './cloud-storage.service';
import { STORAGE_SERVICE } from './storage.interface';
import type { IStorageService } from './storage.interface';
import { ImportTaskService } from './import-task.service';

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    @InjectRepository(ImportJobEntity)
    private readonly repo: Repository<ImportJobEntity>,
    private readonly questionBankService: QuestionBankService,
    private readonly fileParserService: FileParserService,
    private readonly questionParserService: QuestionParserService,
    private readonly aiBrainService: AiBrainService,
    private readonly cloudStorageService: CloudStorageService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly importTaskService: ImportTaskService,
  ) {}

  /**
   * 从文件、fileID 或 base64 数据获取文件内容
   */
  private async getFileContent(
    file: Express.Multer.File | undefined,
    fileID: string | undefined,
    fileData: string | undefined,
    filename: string,
  ): Promise<{ buffer: Buffer; mimetype: string; originalname: string }> {
    // 优先使用直接上传的文件
    if (file) {
      return {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
      };
    }

    // 其次处理 base64 数据（云托管环境）
    if (fileData) {
      this.logger.log(`Processing base64 file data: ${filename}`);
      const buffer = Buffer.from(fileData, 'base64');
      
      // 根据文件名推断 mimetype
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      let mimetype = 'application/octet-stream';
      if (ext === 'pdf') mimetype = 'application/pdf';
      else if (ext === 'doc') mimetype = 'application/msword';
      else if (ext === 'docx') mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === 'txt') mimetype = 'text/plain';
      
      return {
        buffer,
        mimetype,
        originalname: filename,
      };
    }

    // 否则从云存储下载
    if (fileID) {
      // 根据文件名推断 mimetype 的辅助函数
      const getMimetype = (fname: string) => {
        const ext = fname.split('.').pop()?.toLowerCase() || '';
        if (ext === 'pdf') return 'application/pdf';
        if (ext === 'doc') return 'application/msword';
        if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (ext === 'txt') return 'text/plain';
        return 'application/octet-stream';
      };

      // 优先处理 cloud:// 格式的 fileID（仅微信云，小程序端 wx.cloud.uploadFile 上传的）
      if (this.storage.isCloudFileID?.(fileID)) {
        this.logger.log(`Downloading file from cloud fileID: ${fileID}`);
        const buffer = await this.storage.downloadFileByCloudID!(fileID);
        
        return {
          buffer,
          mimetype: getMimetype(filename),
          originalname: filename,
        };
      }
      // 处理当前存储的 URL（OSS 或 COS）
      else if (this.storage.isValidStorageUrl?.(fileID)) {
        this.logger.log(`Downloading file from storage URL: ${fileID}`);
        const buffer = await this.storage.downloadFileByUrl!(fileID);
        
        return {
          buffer,
          mimetype: getMimetype(filename),
          originalname: filename,
        };
      }
      // 向后兼容：支持旧的 CloudBase fileID
      else if (this.cloudStorageService.isValidFileID(fileID)) {
        this.logger.log(`Downloading file from cloud storage (legacy): ${fileID}`);
        const buffer = await this.cloudStorageService.downloadFile(fileID);
        
        return {
          buffer,
          mimetype: getMimetype(filename),
          originalname: filename,
        };
      }
    }

    throw new BadRequestException('文件或 fileID 必须提供其一');
  }

  async createAiGenerationJob(
    dto: GenerateAiQuestionsDto,
    userId: string,
    file?: Express.Multer.File,
  ): Promise<ImportJobEntity> {
    // 处理 base64 数据
    let fileBuffer: Buffer | undefined = file?.buffer;
    let fileMimetype: string | undefined = file?.mimetype;
    const filename = dto.filename || file?.originalname || 'unknown.file';
    
    if (!file && dto.fileData) {
      // 从 base64 解码文件数据
      fileBuffer = Buffer.from(dto.fileData, 'base64');
      
      // 根据文件名推断 mimetype
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      if (ext === 'pdf') fileMimetype = 'application/pdf';
      else if (ext === 'doc') fileMimetype = 'application/msword';
      else if (ext === 'docx') fileMimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === 'txt') fileMimetype = 'text/plain';
      else fileMimetype = 'application/octet-stream';
      
      this.logger.log(`Received base64 file data: ${filename} (${fileBuffer.length} bytes)`);
    }
    
    // 创建任务记录
    const job = this.repo.create({
      userId,
      filename,
      status: 'pending' as ImportJobStatus,
      totalQuestions: 0,
      succeededQuestions: 0,
      failedQuestions: 0,
    });
    await this.repo.save(job);

    // 异步处理任务
    await this.importTaskService.enqueueTask({
      userId,
      jobId: job.id,
      fileBuffer,
      fileMimetype,
      fileOriginalName: filename,
      fileID: dto.fileID,
      questionSetTitle: dto.questionSetTitle,
      subject: dto.subject,
      count: dto.count,
      types: dto.types,
      difficulty: dto.difficulty,
      mode: 'smart',
    });

    this.logger.log(`Smart generation job ${job.id} created and enqueued`);
    return job;
  }

  async createJob(
    dto: CreateImportJobDto,
    userId: string,
    file?: Express.Multer.File,
  ): Promise<ImportJobEntity> {
    // 处理 base64 数据
    let fileBuffer: Buffer | undefined = file?.buffer;
    let fileMimetype: string | undefined = file?.mimetype;
    const filename = dto.filename || file?.originalname || 'manual-input';
    
    if (!file && dto.fileData) {
      // 从 base64 解码文件数据
      fileBuffer = Buffer.from(dto.fileData, 'base64');
      
      // 根据文件名推断 mimetype
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      if (ext === 'pdf') fileMimetype = 'application/pdf';
      else if (ext === 'doc') fileMimetype = 'application/msword';
      else if (ext === 'docx') fileMimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === 'txt') fileMimetype = 'text/plain';
      else fileMimetype = 'application/octet-stream';
      
      this.logger.log(`Received base64 file data: ${filename} (${fileBuffer.length} bytes)`);
    }
    
    // 创建任务记录
    const job = this.repo.create({
      userId,
      filename,
      status: 'pending' as ImportJobStatus,
      totalQuestions: 0,
      succeededQuestions: 0,
      failedQuestions: 0,
    });
    await this.repo.save(job);

    // 如果有文件，异步处理
    if (fileBuffer || dto.fileID) {
      await this.importTaskService.enqueueTask({
        userId,
        jobId: job.id,
        fileBuffer,
        fileMimetype,
        fileOriginalName: filename,
        fileID: dto.fileID,
        questionSetTitle: dto.questionSetTitle,
        subject: dto.subject,
        mode: 'direct',
      });

      this.logger.log(`Direct import job ${job.id} created and enqueued`);
      return job;
          }

    // 如果直接提供了题目数据（手动输入），立即处理
    if (dto.questions && dto.questions.length > 0) {
      const set = await this.questionBankService.createQuestionSet(
        {
          title: dto.questionSetTitle,
          subject: dto.subject,
          description: 'Manual input',
          source: 'manual',
        },
        userId,
      );

      let succeeded = 0;
      for (const question of dto.questions) {
        try {
        await this.questionBankService.createQuestion(set.id, question, userId);
        succeeded += 1;
        } catch (e) {
          this.logger.error('Failed to save manual question', e);
        }
      }

      job.status = 'completed';
      job.totalQuestions = dto.questions.length;
      job.succeededQuestions = succeeded;
      job.failedQuestions = dto.questions.length - succeeded;
      job.questionSetId = set.id;
      
      await this.repo.save(job);
    }

    return job;
  }

  listJobs(userId: string): Promise<ImportJobEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getJob(id: string, userId: string): Promise<ImportJobEntity> {
    const job = await this.repo.findOne({ where: { id, userId } });
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    return job;
  }
}
