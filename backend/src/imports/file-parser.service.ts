import { Inject, Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mammoth from 'mammoth';
import AdmZip = require('adm-zip');
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { STORAGE_SERVICE } from './storage.interface';
import type { IStorageService } from './storage.interface';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require('pdf-parse');

interface MineruConfig {
  enabled: boolean;
  type: 'local' | 'official';
  parseUrl: string;
  apiKey?: string;
}

@Injectable()
export class FileParserService {
  private readonly logger = new Logger(FileParserService.name);
  private readonly mineruConfig: MineruConfig;

  constructor(
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {
    const mineruCfg = this.configService.get<any>('mineru');
    this.mineruConfig = {
      enabled: !!mineruCfg?.enabled && !!mineruCfg?.parseUrl,
      type: mineruCfg?.type || 'local',
      parseUrl: mineruCfg?.parseUrl || '',
      apiKey: mineruCfg?.apiKey || '',
    };

    if (this.storage.isCloudAvailable()) {
      this.logger.log('Cloud storage available for FileParser');
    } else {
      this.logger.warn('Cloud storage not available (local dev) — MinerU official will fallback to local or native parser');
    }
  }

  async parseFile(
    buffer: Buffer,
    mimeType: string,
    originalName: string,
  ): Promise<string> {
    const isDocx =
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      originalName.endsWith('.docx');
    const isPdf =
      mimeType === 'application/pdf' || originalName.endsWith('.pdf');

    if (!isDocx && !isPdf) {
      throw new BadRequestException(
        'Unsupported file type. Only .docx and .pdf are supported.',
      );
    }

    if (this.mineruConfig.enabled) {
      if (this.mineruConfig.type === 'official' && this.storage.isCloudAvailable()) {
        return this.parseWithMineruOfficial(buffer, originalName);
      }
      if (this.mineruConfig.type === 'official' && !this.storage.isCloudAvailable()) {
        this.logger.warn('MinerU official requires cloud storage; falling back to MinerU local or native parser');
        if (this.mineruConfig.parseUrl) {
          try {
            return await this.parseWithMineruLocal(buffer, originalName, mimeType);
          } catch (e) {
            this.logger.warn('MinerU local fallback failed, using native parser:', e?.message);
          }
        }
        return isDocx ? this.parseDocx(buffer) : this.parsePdf(buffer);
      }
      return this.parseWithMineruLocal(buffer, originalName, mimeType);
    }

    if (isDocx) {
      return this.parseDocx(buffer);
    }
    return this.parsePdf(buffer);
  }

  /**
   * Local MinerU: Direct binary POST
   */
  private async parseWithMineruLocal(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<string> {
    if (!this.mineruConfig.parseUrl) {
      throw new BadRequestException('MinerU parse url is not configured');
    }

    try {
      const form = new FormData();
      // Cast buffer to any to bypass strict type check for Blob, or convert to Uint8Array
      const file = new Blob([new Uint8Array(buffer)], { type: mimeType });
      form.append('file', file, originalName);

      const headers: Record<string, string> = {};
      if (this.mineruConfig.apiKey) {
        headers['Authorization'] = `Bearer ${this.mineruConfig.apiKey}`;
      }

      const res = await fetch(this.mineruConfig.parseUrl, {
        method: 'POST',
        headers,
        body: form as any,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `MinerU (local) request failed: ${res.status} ${res.statusText} ${text}`,
        );
      }

      const data = (await res.json()) as {
        markdown?: string;
        text?: string;
        content?: string;
      };
      const text =
        data.markdown?.toString() ||
        data.text?.toString() ||
        data.content?.toString() ||
        '';

      if (!text) {
        throw new Error('MinerU response did not contain text content');
      }

      return text;
    } catch (error) {
      this.logger.error('MinerU (local) parsing error:', error);
      throw new BadRequestException('Failed to parse file via MinerU');
    }
  }

  /**
   * Official MinerU: Task -> Poll -> Download -> Extract
   */
  private async parseWithMineruOfficial(
    buffer: Buffer,
    originalName: string,
  ): Promise<string> {
    try {
      // 1. Upload file to CloudBase to get public URL
      const fileUrl = await this.uploadToCloud(buffer, originalName);
      this.logger.log(`File URL for MinerU: ${fileUrl}`);

      // 2. Create Task
      const taskId = await this.createMineruTask(fileUrl);
      this.logger.log(`MinerU task created: ${taskId}`);

      // 3. Poll Task
      const zipUrl = await this.pollMineruTask(taskId);
      this.logger.log(`MinerU task done, zip url: ${zipUrl}`);

      // 4. Download and Extract
      return await this.downloadAndExtractZip(zipUrl);

    } catch (error) {
      this.logger.error('MinerU (official) parsing error:', error);
      throw new BadRequestException(`Failed to parse file via MinerU: ${error.message}`);
    }
  }

  private async uploadToCloud(buffer: Buffer, filename: string): Promise<string> {
    if (!this.storage.isConfigured()) {
      throw new Error('WxCloud Storage is not configured. Please configure WXCLOUD_BUCKET.');
    }

    try {
      // 提取扩展名，使用安全的文件名（避免中文导致的 URL 编码问题）
      const ext = path.extname(filename) || '.pdf';
      const safeFilename = `file${ext}`;
      
      // 1. 上传文件到对象存储（OSS 或微信云）
      const publicUrl = await this.storage.uploadFile(buffer, safeFilename, 'mineru-uploads');
      this.logger.log(`File uploaded to cloud storage: ${publicUrl}`);
      
      // 2. 从 URL 提取 Key
      const key = this.storage.getKeyFromUrl(publicUrl);
      
      // 3. 生成带签名的临时访问 URL（有效期 2 小时，足够 MinerU 处理）
      const signedUrl = await this.storage.getSignedUrl(key, 7200);
      this.logger.log(`Generated signed URL for MinerU (valid for 2 hours)`);
      
      return signedUrl;
    } catch (error) {
      this.logger.error('Cloud storage upload or signing failed:', error);
      throw new Error(`Failed to upload file to cloud storage: ${error.message}`);
    }
  }

  private async createMineruTask(fileUrl: string): Promise<string> {
    const url = `${this.mineruConfig.parseUrl.replace(/\/$/, '')}`; // e.g. https://mineru.net/api/v4/extract/task
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.mineruConfig.apiKey}`,
      },
      body: JSON.stringify({
        url: fileUrl,
        model_version: 'vlm', // or 'pipeline'
        is_ocr: true,
        enable_formula: true,
        enable_table: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Create task failed: ${res.status} ${text}`);
    }

    const json = await res.json() as any;
    if (json.code !== 0) {
      throw new Error(`MinerU API Error: ${json.msg}`);
    }
    return json.data.task_id;
  }

  private async pollMineruTask(taskId: string): Promise<string> {
    const url = `${this.mineruConfig.parseUrl.replace(/\/$/, '')}/${taskId}`;
    // Increase timeout to ~10 minutes (200 * 3s = 600s)
    const maxRetries = 200;
    
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.mineruConfig.apiKey}`,
          },
        });
        
        if (!res.ok) {
          this.logger.warn(`Poll task ${taskId} failed with status ${res.status}`);
          continue;
        }
        
        const json = await res.json() as any;
        if (json.code !== 0) {
          this.logger.warn(`Poll task ${taskId} API error: ${json.msg}`);
          continue;
        }
        
        const state = json.data.state;
        // Log progress every 10 attempts (30s) or on state change (if we tracked it)
        if (i % 10 === 0) {
            this.logger.debug(`MinerU Task ${taskId} state: ${state}, progress: ${json.data.extract_progress?.extracted_pages}/${json.data.extract_progress?.total_pages}`);
        }

        if (state === 'done') {
          return json.data.full_zip_url;
        }
        if (state === 'failed') {
          throw new Error(`MinerU task failed: ${json.data.err_msg}`);
        }
      } catch (e) {
        this.logger.warn(`Poll task ${taskId} network error`, e);
      }
    }
    throw new Error('MinerU task timed out after 10 minutes');
  }

  private async downloadAndExtractZip(zipUrl: string): Promise<string> {
    // Download
    const res = await fetch(zipUrl);
    if (!res.ok) throw new Error('Failed to download result zip');
    
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Extract
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    
    // Find .md file
    const mdEntry = zipEntries.find((entry) => entry.entryName.endsWith('.md') && !entry.entryName.startsWith('__MACOSX'));
    
    if (!mdEntry) {
      throw new Error('No markdown file found in MinerU result zip');
    }
    
    return zip.readAsText(mdEntry);
  }

  private async parseDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      this.logger.error('Docx parsing error:', error);
      throw new BadRequestException('Failed to parse .docx file');
    }
  }

  private async parsePdf(buffer: Buffer): Promise<string> {
    try {
      const data = await pdf(buffer);
      return data.text;
    } catch (error) {
      this.logger.error('PDF parsing error:', error);
      throw new BadRequestException(
        `Failed to parse .pdf file: ${error.message || error}`,
      );
    }
  }
}
