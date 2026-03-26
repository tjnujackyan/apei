import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ASR_CLIENT_TOKEN } from './asr.tokens';
import type { AsrClient, AsrResult } from './interfaces/asr-client';
import { STORAGE_SERVICE } from '../imports/storage.interface';
import type { IStorageService } from '../imports/storage.interface';

@Injectable()
export class AsrService {
  private readonly logger = new Logger(AsrService.name);

  constructor(
    @Inject(ASR_CLIENT_TOKEN) private readonly asrClient: AsrClient,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {
    if (this.storage.isCloudAvailable()) {
      this.logger.log('Cloud storage available for ASR audio upload');
    } else {
      this.logger.warn('Cloud storage not available for ASR (local dev) — will use mock mode');
    }
  }

  async transcribe(file: Express.Multer.File): Promise<{ text: string; utterances?: any[] }> {
    this.logger.log(`Received audio file: ${file.originalname} (${file.size} bytes)`);

    // 云存储可用：上传到 OSS/COS → 拿公网 URL → 调火山引擎 ASR
    if (this.storage.isCloudAvailable()) {
      try {
        const filename = `${uuidv4()}${this.getExtension(file.originalname, file.mimetype)}`;
        const audioUrl = await this.storage.uploadFile(file.buffer, filename, 'asr-uploads');
        this.logger.log(`Audio uploaded to cloud: ${audioUrl}`);

        const format = this.getAudioFormat(file.mimetype, file.originalname);
        const result: AsrResult = await this.asrClient.transcribe(audioUrl, {
          format,
          enablePunctuation: true,
          enableItn: true,
          showUtterances: true,
        });

        this.logger.log(`Transcription: "${result.text}"`);
        return { text: result.text, utterances: result.utterances };
      } catch (error: any) {
        this.logger.error(`ASR failed: ${error.message}`);
        if (process.env.NODE_ENV === 'production') throw error;
        this.logger.warn('Production ASR failed, falling back to mock');
        return this.mockTranscribe();
      }
    }

    // 本地开发环境：火山 ASR 需要公网可达的音频 URL，本地无法提供
    this.logger.warn('Local dev: using mock transcription (ASR requires public audio URL)');
    return this.mockTranscribe();
  }

  private getExtension(filename: string, mimetype: string): string {
    // 从文件名获取扩展名
    const ext = path.extname(filename).toLowerCase();
    if (ext) return ext;

    // 从MIME类型推断
    const mimeToExt: Record<string, string> = {
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/wav': '.wav',
      'audio/x-wav': '.wav',
      'audio/ogg': '.ogg',
      'audio/aac': '.aac',
      'audio/m4a': '.m4a',
      'audio/webm': '.webm',
    };

    return mimeToExt[mimetype] || '.mp3';
  }

  private getAudioFormat(mimetype: string, filename: string): 'mp3' | 'wav' | 'ogg' | 'raw' {
    const ext = path.extname(filename).toLowerCase();
    
    if (ext === '.mp3' || mimetype.includes('mp3') || mimetype.includes('mpeg')) {
      return 'mp3';
    }
    if (ext === '.wav' || mimetype.includes('wav')) {
      return 'wav';
    }
    if (ext === '.ogg' || mimetype.includes('ogg')) {
      return 'ogg';
    }
    
    return 'mp3'; // 默认
  }

  private mockTranscribe(): { text: string } {
    const mockResponses = [
      "帮我分析一下我的弱项",
      "我最近复习效率有点低，有什么建议吗？",
      "帮我生成一个15天学习计划",
      "看看我的整体学习情况",
      "我离上岸还有多远？",
    ];
    
    const randomText = mockResponses[Math.floor(Math.random() * mockResponses.length)];
    this.logger.log(`[Mock ASR] "${randomText}"`);
    
    return { text: randomText };
  }
}
