import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AsrController } from './asr.controller';
import { AsrService } from './asr.service';
import { ASR_CLIENT_TOKEN } from './asr.tokens';
import { DoubaoAsrClient } from './doubao-asr.client';
import { StorageModule } from '../imports/storage.module';

@Module({
  imports: [ConfigModule, StorageModule],
  controllers: [AsrController],
  providers: [
    {
      provide: ASR_CLIENT_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const appId = config.get<string>('asr.appId');
        const accessKey = config.get<string>('asr.accessKey');
        const resourceId = config.get<string>('asr.resourceId');

        return new DoubaoAsrClient({
          appId: appId || '',
          accessKey: accessKey || '',
          resourceId: resourceId || 'volc.bigasr.auc',
          pollIntervalMs: 2000,
          maxPollAttempts: 60,
        });
      },
    },
    AsrService,
  ],
  exports: [AsrService],
})
export class AsrModule {}
