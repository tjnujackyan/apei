import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
const COS = require('cos-nodejs-sdk-v5');

/**
 * 微信云托管对象存储服务
 * 
 * 根据官方文档实现：
 * https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/storage/service/cos-sdk.html
 * 
 * 主要步骤：
 * 1. 通过开放接口服务获取临时密钥
 * 2. 使用临时密钥初始化 COS-SDK
 * 3. 上传文件时获取文件元数据，保证小程序端可以访问
 */
@Injectable()
export class WxCloudStorageService {
  private readonly logger = new Logger(WxCloudStorageService.name);
  private cosClient: any = null;
  private bucket: string;
  private region: string;
  private isWxCloudEnv: boolean = false;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('wxcloud.bucket') || '';
    this.region = this.configService.get<string>('wxcloud.region') || 'ap-shanghai';
    
    // 检测是否在微信云托管环境中运行
    this.isWxCloudEnv = !!process.env.WX_ENV_ID || !!process.env.TENCENTCLOUD_RUNENV;
    
    if (this.bucket) {
      // 使用临时密钥方式初始化 COS SDK
      this.cosClient = new COS({
        getAuthorization: async (options, callback) => {
          try {
            const credentials = await this.getTemporaryCredentials();
            callback({
              TmpSecretId: credentials.TmpSecretId,
              TmpSecretKey: credentials.TmpSecretKey,
              SecurityToken: credentials.Token,
              StartTime: Math.floor(Date.now() / 1000),
              ExpiredTime: credentials.ExpiredTime,
            });
          } catch (error) {
            this.logger.error('Failed to get temporary credentials:', error);
            callback(new Error('Failed to get credentials'));
          }
        },
      });
      this.logger.log(`WxCloud Storage initialized for bucket: ${this.bucket}, region: ${this.region}`);
    } else {
      this.logger.warn('WxCloud Storage not initialized: missing WXCLOUD_BUCKET configuration');
    }
  }

  /**
   * 获取临时密钥
   * 通过微信云托管开放接口服务获取
   */
  private async getTemporaryCredentials(): Promise<{
    TmpSecretId: string;
    TmpSecretKey: string;
    Token: string;
    ExpiredTime: number;
  }> {
    // 在云托管环境内，直接调用内网接口
    const url = 'http://api.weixin.qq.com/_/cos/getauth';
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get credentials: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.TmpSecretId) {
      throw new Error('Invalid credentials response');
    }

    return {
      TmpSecretId: data.TmpSecretId,
      TmpSecretKey: data.TmpSecretKey,
      Token: data.Token,
      ExpiredTime: data.ExpiredTime,
    };
  }

  /**
   * 获取文件元数据
   * 上传文件时需要添加元数据，以保证小程序端可以访问
   */
  private async getFileMetadata(cloudPath: string, openid: string = ''): Promise<string> {
    const url = 'http://api.weixin.qq.com/_/cos/metaid/encode';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        openid: openid, // 管理端为空字符串
        bucket: this.bucket,
        paths: [`/${cloudPath}`],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get file metadata: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errcode !== 0) {
      throw new Error(`Metadata API error: ${data.errmsg}`);
    }

    return data.respdata.x_cos_meta_field_strs[0];
  }

  /**
   * 检查服务是否已配置（仅检查 bucket + cosClient）
   */
  isConfigured(): boolean {
    return this.cosClient !== null && !!this.bucket;
  }

  /**
   * 检查云存储是否真正可用（配置完整 + 在云托管环境内）
   * 本地开发环境即使配了 bucket，内网 API（getauth / metaid）也不可达，返回 false
   */
  isCloudAvailable(): boolean {
    return this.isConfigured() && this.isWxCloudEnv;
  }

  /**
   * 上传文件到微信云托管对象存储
   * @param buffer 文件内容
   * @param filename 文件名
   * @param folder 文件夹路径（可选）
   * @param openid 上传者 openid（可选，管理端上传传空字符串）
   * @returns 文件 URL
   */
  async uploadFile(
    buffer: Buffer,
    filename: string,
    folder: string = 'uploads',
    openid: string = '',
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('WxCloud Storage is not configured');
    }

    const key = `${folder}/${Date.now()}-${uuidv4()}-${filename}`;

    try {
      // 获取文件元数据
      const metaFileId = await this.getFileMetadata(key, openid);

      return new Promise((resolve, reject) => {
        this.cosClient!.putObject(
          {
            Bucket: this.bucket,
            Region: this.region,
            Key: key,
            Body: buffer,
            Headers: {
              'x-cos-meta-fileid': metaFileId, // 关键：添加文件元数据
            },
          },
          (err, data) => {
            if (err) {
              this.logger.error(`Failed to upload file to WxCloud Storage: ${err.message}`);
              reject(err);
            } else {
              const url = `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`;
              this.logger.log(`File uploaded to WxCloud Storage: ${url}`);
              resolve(url);
            }
          },
        );
      });
    } catch (error) {
      this.logger.error(`Upload failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 从对象存储下载文件
   * @param key 文件在存储中的 Key
   * @returns 文件内容 Buffer
   */
  async downloadFile(key: string): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new Error('WxCloud Storage is not configured');
    }

    this.logger.log(`Downloading file from WxCloud Storage: ${key}`);

    return new Promise((resolve, reject) => {
      this.cosClient!.getObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
        },
        (err, data) => {
          if (err) {
            this.logger.error(`Failed to download file: ${err.message}`);
            reject(err);
          } else {
            resolve(data.Body as Buffer);
          }
        },
      );
    });
  }

  /**
   * 从完整的 URL 下载文件
   * @param url 文件 URL
   * @returns 文件内容 Buffer
   */
  async downloadFileByUrl(url: string): Promise<Buffer> {
    const key = this.getKeyFromUrl(url);
    return this.downloadFile(key);
  }

  /**
   * 获取文件的临时访问 URL（带签名）
   * @param key 文件在存储中的 Key
   * @param expires 有效期（秒），默认 3600（1小时）
   * @returns 临时访问 URL
   */
  async getSignedUrl(key: string, expires: number = 3600): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('WxCloud Storage is not configured');
    }

    return new Promise((resolve, reject) => {
      this.cosClient!.getObjectUrl(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
          Sign: true,
          Expires: expires,
        },
        (err, data) => {
          if (err) {
            this.logger.error(`Failed to get signed URL: ${err.message}`);
            reject(err);
          } else {
            resolve(data.Url);
          }
        },
      );
    });
  }

  /**
   * 删除文件
   * @param key 文件在存储中的 Key
   */
  async deleteFile(key: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('WxCloud Storage is not configured');
    }

    return new Promise((resolve, reject) => {
      this.cosClient!.deleteObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
        },
        (err, data) => {
          if (err) {
            this.logger.error(`Failed to delete file: ${err.message}`);
            reject(err);
          } else {
            this.logger.log(`File deleted: ${key}`);
            resolve();
          }
        },
      );
    });
  }

  /**
   * 从 URL 提取文件 Key
   * @param url 文件 URL
   * @returns 文件 Key
   */
  getKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // 移除开头的 '/'
      return urlObj.pathname.substring(1);
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  /**
   * 检查 URL 是否为有效的对象存储 URL
   * @param url 待检查的 URL
   * @returns 是否为有效的对象存储 URL
   */
  isValidStorageUrl(url: string): boolean {
    if (!url) return false;
    // 检查是否为 COS URL 格式或 cloud:// 格式
    return (url.includes('.cos.') && url.includes('.myqcloud.com/')) || url.startsWith('cloud://');
  }

  /**
   * 检查是否为 cloud:// 格式的 fileID
   */
  isCloudFileID(fileID: string): boolean {
    return !!fileID && fileID.startsWith('cloud://');
  }

  /**
   * 从 cloud:// 格式的 fileID 提取文件路径
   * fileID 格式: cloud://env-id/path/to/file
   * @param fileID cloud:// 格式的文件ID
   * @returns 文件在存储桶中的路径
   */
  getPathFromCloudFileID(fileID: string): string {
    if (!this.isCloudFileID(fileID)) {
      throw new Error(`Invalid cloud fileID: ${fileID}`);
    }
    // cloud://env-id/path/to/file -> path/to/file
    const parts = fileID.replace('cloud://', '').split('/');
    // 第一部分是环境ID，后面的是路径
    return parts.slice(1).join('/');
  }

  /**
   * 从 cloud:// 格式的 fileID 下载文件
   * @param fileID cloud:// 格式的文件ID
   * @returns 文件内容 Buffer
   */
  async downloadFileByCloudID(fileID: string): Promise<Buffer> {
    const key = this.getPathFromCloudFileID(fileID);
    this.logger.log(`Downloading file from cloud fileID: ${fileID}, key: ${key}`);
    return this.downloadFile(key);
  }
}

