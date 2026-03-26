import { Body, Controller, Get, Patch, Post, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Logger, Inject } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePhoneDto } from './dto/update-phone.dto';
import { STORAGE_SERVICE } from '../imports/storage.interface';
import type { IStorageService } from '../imports/storage.interface';
import * as fs from 'fs';
import * as path from 'path';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  @Get('me')
  async getProfile(@CurrentUser() user: RequestUser) {
    const userEntity = await this.usersService.findById(user.userId);
    if (!userEntity) return null;
    
    // 如果 chatDiyConfig 含 storageKey，动态刷新签名 URL（防止过期）
    if (userEntity.chatDiyConfig && this.storage.isCloudAvailable()) {
      try {
        const config = userEntity.getChatDiyConfig();
        let needsUpdate = false;
        
        if (config.avatarStorageKey) {
          config.customAvatarUrl = await this.storage.getSignedUrl(config.avatarStorageKey, 7 * 24 * 60 * 60);
          needsUpdate = true;
        }
        if (config.bgStorageKey) {
          config.customBackgroundUrl = await this.storage.getSignedUrl(config.bgStorageKey, 7 * 24 * 60 * 60);
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          userEntity.setChatDiyConfig(config);
        }
      } catch (err) {
        this.logger.warn(`Failed to refresh DIY signed URLs: ${err.message}`);
      }
    }
    
    return userEntity;
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  @Patch('me/phone')
  updatePhone(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdatePhoneDto,
  ) {
    return this.usersService.updatePhone(user.userId, dto.phoneNumber, dto.smsCode);
  }

  /**
   * 上传 DIY 图片（头像或背景）
   * 支持三种方式：
   * 1. multipart/form-data 上传文件（本地开发 → 存本地；生产 → 存 COS）
   * 2. JSON body 中的 fileID（小程序端先上传到云存储，再传 fileID）
   * 3. JSON body 中的 base64 数据（向后兼容）
   */
  @Post('upload-diy-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDiyImage(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
    @Body('fileID') fileID?: string,
    @Body('fileData') fileData?: string,
  ) {
    if (!file && !fileID && !fileData) {
      throw new BadRequestException('请选择文件');
    }

    try {
      // 方式1：处理 cloud:// 格式的 fileID（仅微信云存储，小程序端先上传到云存储）
      if (fileID && this.storage.isCloudFileID?.(fileID)) {
        if (!this.storage.isCloudAvailable()) {
          throw new BadRequestException('云存储服务不可用（需在云托管环境中运行）');
        }
        this.logger.log(`Processing cloud fileID: ${fileID}`);
        const storageKey = this.storage.getPathFromCloudFileID!(fileID);
        const signedUrl = await this.storage.getSignedUrl(storageKey, 7 * 24 * 60 * 60);
        
        return {
          success: true,
          url: signedUrl,
          storageKey: storageKey,
          fileID: fileID,
        };
      }
      
      // 提取文件 buffer
      let buffer: Buffer;
      let ext = 'jpg';
      
      if (file) {
        buffer = file.buffer;
        ext = file.originalname.split('.').pop() || 'jpg';
      } else if (fileData) {
        buffer = Buffer.from(fileData, 'base64');
      } else {
        throw new BadRequestException('请选择文件');
      }
      
      const folder = type === 'avatar' ? 'diy-avatars' : 'diy-backgrounds';
      const filename = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;

      // 云存储可用（OSS 或微信云）→ 上传到云存储
      if (this.storage.isCloudAvailable()) {
        const storageUrl = await this.storage.uploadFile(buffer, filename, folder);
        const storageKey = this.storage.getKeyFromUrl(storageUrl);
        const signedUrl = await this.storage.getSignedUrl(storageKey, 7 * 24 * 60 * 60);
        
        return {
          success: true,
          url: signedUrl,
          storageKey: storageKey,
        };
      }
      
      // 本地开发环境 → 保存到本地 static 目录
      this.logger.warn('Not in cloud environment, saving file locally');
      const uploadDir = path.join(process.cwd(), 'uploads', folder);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const localPath = path.join(uploadDir, filename);
      fs.writeFileSync(localPath, buffer);
      
      const port = process.env.PORT || 80;
      const host = `http://localhost:${port}`;
      const localUrl = `${host}/uploads/${folder}/${filename}`;
      this.logger.log(`File saved locally: ${localUrl}`);
      
      return {
        success: true,
        url: localUrl,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Upload DIY image failed:', error);
      throw new BadRequestException('上传失败：' + error.message);
    }
  }
}
