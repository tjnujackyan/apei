import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsRequestDto } from './dto/tts-request.dto';
import { TTS_CLIENT_TOKEN } from './tts.tokens';
import type { TtsClient } from './interfaces/tts-client';
import { STORAGE_SERVICE } from '../imports/storage.interface';
import type { IStorageService } from '../imports/storage.interface';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  constructor(
    @Inject(TTS_CLIENT_TOKEN) private readonly client: TtsClient,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {
    if (this.storage.isCloudAvailable()) {
      this.logger.log('Cloud storage available for TTS audio');
    } else {
      this.logger.warn('Cloud storage not available — TTS audio will be saved locally');
    }
  }

  async synthesize(dto: TtsRequestDto) {
    const result = await this.client.synthesize(dto.text, {
      voice: dto.voice ?? this.config.get<string>('tts.voice'),
      sampleRate: dto.sampleRate,
      referenceText: dto.referenceText,
      emotion: dto.emotion,
    });

    const fileName = `tts-${uuidv4()}.mp3`;
    const audioBuffer = Buffer.from(result.audioBase64, 'base64');

    let audioUrl: string;

    // 云存储可用（OSS 或微信云）：上传并返回签名 URL
    if (this.storage.isCloudAvailable()) {
      try {
        const publicUrl = await this.storage.uploadFile(audioBuffer, fileName, 'tts-audio');
        // 由于 OSS 已设置为公共读，直接使用 publicUrl，不再生成带签名的临时链接
        audioUrl = publicUrl;
        this.logger.log('TTS audio uploaded to cloud storage');
      } catch (e) {
        this.logger.error('Cloud upload failed, falling back to local file', e);
        audioUrl = this.saveToLocal(audioBuffer, fileName);
      }
    } else {
      // 本地开发环境：保存到本地文件，返回完整 HTTP URL
      audioUrl = this.saveToLocal(audioBuffer, fileName);
    }

    return { audioUrl };
  }

  private saveToLocal(buffer: Buffer, fileName: string): string {
    const folder = 'tts-audio';
    const uploadDir = path.join(process.cwd(), 'uploads', folder);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);
    
    const port = process.env.PORT || 80;
    const url = `http://localhost:${port}/uploads/${folder}/${fileName}`;
    this.logger.log(`TTS audio saved locally: ${url}`);
    return url;
  }

  private extractKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1);
    } catch (error) {
      throw new Error(`Invalid storage URL: ${url}`);
    }
  }
}
