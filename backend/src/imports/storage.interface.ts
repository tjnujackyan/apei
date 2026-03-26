/**
 * 统一对象存储接口
 * 可由阿里云 OSS 或微信云 COS 实现，便于按配置切换
 */
export interface IStorageService {
  /** 是否已配置（有 bucket/密钥等） */
  isConfigured(): boolean;
  /** 是否当前可用（配置完整且环境可访问） */
  isCloudAvailable(): boolean;
  /** 上传文件，返回存储 URL */
  uploadFile(
    buffer: Buffer,
    filename: string,
    folder?: string,
    openid?: string,
  ): Promise<string>;
  /** 获取带签名的临时访问 URL */
  getSignedUrl(key: string, expires?: number): Promise<string>;
  /** 从完整 URL 解析出存储 Key */
  getKeyFromUrl(url: string): string;
  /** 是否为微信 cloud:// 格式的 fileID（仅微信云实现返回 true） */
  isCloudFileID?(fileID: string): boolean;
  /** 从 cloud:// fileID 解析存储路径（仅微信云需要） */
  getPathFromCloudFileID?(fileID: string): string;
  /** 是否为当前存储的 URL（用于导入任务判断是否从本存储下载） */
  isValidStorageUrl?(url: string): boolean;
  /** 从 URL 下载文件（用于导入任务） */
  downloadFileByUrl?(url: string): Promise<Buffer>;
  /** 从 cloud:// fileID 下载（仅微信云需要） */
  downloadFileByCloudID?(fileID: string): Promise<Buffer>;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';
