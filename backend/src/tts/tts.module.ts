import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TtsService } from './tts.service';
import { TtsController } from './tts.controller';
import { TTS_CLIENT_TOKEN } from './tts.tokens';
import { DoubaoTtsClient } from './doubao-tts.client';
import { StorageModule } from '../imports/storage.module';

@Module({
  imports: [ConfigModule, StorageModule],
  controllers: [TtsController],
  providers: [
    {
      provide: TTS_CLIENT_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // VolcEngine / Doubao Config
        // wss://openspeech.bytedance.com/api/v3/tts/bidirection
        const baseUrl = config.get<string>('tts.baseUrl');
        const accessToken = config.get<string>('tts.accessToken'); // X-Api-Access-Key
        const appId = config.get<string>('tts.appId'); // X-Api-App-Key
        const resourceId = config.get<string>('tts.resourceId'); // X-Api-Resource-Id
        const voice = config.get<string>('tts.voice');
        const speedRatio = config.get<number>('tts.speedRatio');
        const volumeRatio = config.get<number>('tts.volumeRatio');
        const pitchRatio = config.get<number>('tts.pitchRatio');
        const emotion = config.get<string>('tts.emotion');

        return new DoubaoTtsClient({
          baseUrl:
            baseUrl || 'wss://openspeech.bytedance.com/api/v3/tts/bidirection',
          accessToken: accessToken || '',
          appId: appId || '',
          resourceId: resourceId || 'volc.service_type.10029',
          voice,
          speedRatio,
          volumeRatio,
          pitchRatio,
          emotion,
        });
      },
    },
    TtsService,
  ],
  exports: [TtsService],
})
export class TtsModule {}
