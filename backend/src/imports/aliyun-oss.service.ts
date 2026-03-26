import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OSS from 'ali-oss';
import { v4 as uuidv4 } from 'uuid';
import type { IStorageService } from './storage.interface';

/**
 * 阿里云 OSS 对象存储服务
 * 本地与生产环境均可使用（不依赖微信云内网 API）
 */
@Injectable()
export class AliyunOssService implements IStorageService {
  private readonly logger = new Logger(AliyunOssService.name);
  private client: OSS | null = null;
  private bucket: string;
  private region: string;
  private endpoint: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('oss.region') || 'oss-cn-hangzhou';
    this.bucket = this.configService.get<string>('oss.bucket') || '';
    this.endpoint = this.configService.get<string>('oss.endpoint') || undefined;

    const accessKeyId = this.configService.get<string>('oss.accessKeyId') || '';
    const accessKeySecret = this.configService.get<string>('oss.accessKeySecret') || '';

    if (this.bucket && accessKeyId && accessKeySecret) {
      this.client = new OSS({
        region: this.region,
        accessKeyId,
        accessKeySecret,
        bucket: this.bucket,
        ...(this.endpoint ? { endpoint: this.endpoint } : {}),
      });
      this.logger.log(`Aliyun OSS initialized: bucket=${this.bucket}, region=${this.region}`);
    } else {
      this.logger.warn('Aliyun OSS not initialized: missing OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET');
    }
  }

  isConfigured(): boolean {
    return this.client !== null && !!this.bucket;
  }

  /** OSS 在任意环境可用（不依赖微信云内网），配置即可用 */
  isCloudAvailable(): boolean {
    return this.isConfigured();
  }

  async uploadFile(
    buffer: Buffer,
    filename: string,
    folder: string = 'uploads',
    _openid?: string,
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Aliyun OSS is not configured');
    }
    const key = `${folder}/${Date.now()}-${uuidv4()}-${filename}`;
    await this.client!.put(key, buffer);
    const url = this.endpoint
      ? `${this.endpoint.replace(/\/$/, '')}/${key}`
      : `https://${this.bucket}.${this.region}.aliyuncs.com/${key}`;
    this.logger.log(`File uploaded to OSS: ${url}`);
    return url;
  }

  async getSignedUrl(key: string, expires: number = 3600): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Aliyun OSS is not configured');
    }
    const url = this.client!.signatureUrl(key, { expires });
    return url;
  }

  getKeyFromUrl(url: string): string {
    try {
      const u = new URL(url);
      const pathname = u.pathname;
      // 去掉开头的 /
      return pathname.startsWith('/') ? pathname.slice(1) : pathname;
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  /** OSS 不支持微信 cloud:// fileID */
  isCloudFileID(_fileID: string): boolean {
    return false;
  }

  /** OSS 不支持，仅微信云实现需要 */
  getPathFromCloudFileID(fileID: string): string {
    throw new Error(`Aliyun OSS does not support cloud fileID: ${fileID}`);
  }

  /** 是否为当前 OSS 的 URL（阿里云域名或自定义 endpoint） */
  isValidStorageUrl(url: string): boolean {
    if (!url) return false;
    return (
      url.includes('.aliyuncs.com/') ||
      (!!this.endpoint && url.startsWith(this.endpoint))
    );
  }

  /** 从 URL 下载文件（签名 URL 或公网 URL 均可） */
  async downloadFileByUrl(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSS download failed: ${res.status} ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /** OSS 不支持 cloud:// fileID */
  async downloadFileByCloudID(_fileID: string): Promise<Buffer> {
    throw new Error('Aliyun OSS does not support cloud fileID download');
  }
}
