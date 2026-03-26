import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AliyunOssService } from './aliyun-oss.service';
import { WxCloudStorageService } from './wxcloud-storage.service';
import { STORAGE_SERVICE } from './storage.interface';
import type { IStorageService } from './storage.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    AliyunOssService,
    WxCloudStorageService,
    {
      provide: STORAGE_SERVICE,
      useFactory: (
        config: ConfigService,
        oss: AliyunOssService,
        wx: WxCloudStorageService,
      ): IStorageService => {
        const type = config.get<string>('storage.type') || 'oss';
        return type === 'oss' ? oss : wx;
      },
      inject: [ConfigService, AliyunOssService, WxCloudStorageService],
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
