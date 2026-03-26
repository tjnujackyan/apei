import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as http from 'http';

/**
 * 微信云托管对象存储服务
 * 用于从 fileID 下载文件内容
 */
@Injectable()
export class CloudStorageService {
  private readonly logger = new Logger(CloudStorageService.name);
  private readonly envId: string;

  constructor(private readonly configService: ConfigService) {
    // 云环境 ID，可以从环境变量获取
    this.envId = this.configService.get<string>('CLOUD_ENV_ID') || 'prod-7gi6km8h2021af85';
  }

  /**
   * 从 fileID 下载文件内容
   * fileID 格式: cloud://环境ID.xxx/路径
   */
  async downloadFile(fileID: string): Promise<Buffer> {
    this.logger.log(`Downloading file from cloud storage: ${fileID}`);

    // 在微信云托管环境中，可以通过内部 API 下载文件
    // 如果是本地开发环境，这个功能不可用
    if (!fileID || !fileID.startsWith('cloud://')) {
      throw new Error('Invalid fileID format');
    }

    try {
      // 微信云托管内部有特殊的文件下载机制
      // 这里使用云托管提供的内部 HTTP 接口
      const downloadUrl = await this.getDownloadUrl(fileID);
      
      if (!downloadUrl) {
        throw new Error('Failed to get download URL');
      }

      return await this.downloadFromUrl(downloadUrl);
    } catch (error) {
      this.logger.error(`Failed to download file: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取临时下载 URL
   * 在云托管环境中，通过调用云托管内部 API 获取
   */
  private async getDownloadUrl(fileID: string): Promise<string> {
    try {
      const tcb = require('@cloudbase/node-sdk');
      
      // 微信云托管环境中，优先使用无密钥初始化（自动使用内部认证）
      // 本地开发环境中，需要提供密钥
      const secretId = this.configService.get<string>('TENCENTCLOUD_SECRETID') || process.env.TENCENTCLOUD_SECRETID;
      const secretKey = this.configService.get<string>('TENCENTCLOUD_SECRETKEY') || process.env.TENCENTCLOUD_SECRETKEY;
      
      let app;
      
      // 先尝试无密钥初始化（云托管环境内部认证）
      try {
        this.logger.log('Trying CloudBase initialization without credentials (cloud hosting internal auth)');
        app = tcb.init({
          env: this.envId,
        });
        
        // 测试是否可以正常调用
        const testResult = await app.getTempFileURL({
          fileList: [fileID],
        });
        
        if (testResult.fileList && testResult.fileList.length > 0 && testResult.fileList[0].tempFileURL) {
          this.logger.log('CloudBase initialized successfully with internal auth');
          return testResult.fileList[0].tempFileURL;
        }
      } catch (internalAuthError) {
        this.logger.warn(`Internal auth failed: ${internalAuthError.message}, trying with credentials...`);
      }
      
      // 如果内部认证失败，尝试使用密钥
      if (secretId && secretKey) {
        this.logger.log('Initializing CloudBase with provided credentials');
        app = tcb.init({
          env: this.envId,
          secretId,
          secretKey,
        });

        const result = await app.getTempFileURL({
          fileList: [fileID],
        });

        if (result.fileList && result.fileList.length > 0 && result.fileList[0].tempFileURL) {
          return result.fileList[0].tempFileURL;
        }
      }

      throw new Error('Failed to get temp file URL - no valid auth method available');
    } catch (error) {
      this.logger.error(`CloudBase SDK error: ${error.message}`);
      throw error;
    }
  }

  /**
   * 从 URL 下载文件
   */
  private downloadFromUrl(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const request = url.startsWith('https') ? https.get : http.get;
      
      request(url, (response) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.downloadFromUrl(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP error: ${response.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * 检查是否为有效的云存储 fileID
   */
  isValidFileID(fileID: string): boolean {
    return !!fileID && fileID.startsWith('cloud://');
  }
}
