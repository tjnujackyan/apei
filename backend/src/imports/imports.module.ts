import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ImportsService } from './imports.service';
import { ImportsController } from './imports.controller';
import { QuestionBankModule } from '../question-bank/question-bank.module';
import { ImportJobEntity } from './entities/import-job.entity';
import { FileParserService } from './file-parser.service';
import { QuestionParserService } from './question-parser.service';
import { AiBrainModule } from '../ai-brain/ai-brain.module';
import { CloudStorageService } from './cloud-storage.service';
import { StorageModule } from './storage.module';
import { ImportProgressGateway } from './import-progress.gateway';
import { ImportTaskService } from './import-task.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportJobEntity]),
    QuestionBankModule,
    AiBrainModule,
    StorageModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const expiresIn = config.get<string>('jwt.expiresIn') || '7d';
        return {
          secret: config.get<string>('jwt.secret') || 'default-secret-please-change',
          signOptions: {
            expiresIn: expiresIn as any // Cast to any to avoid type mismatch issues with string/number union
          },
        };
      },
    }),
  ],
  controllers: [ImportsController],
  providers: [
    ImportsService,
    FileParserService,
    QuestionParserService,
    CloudStorageService, // 保留作为向后兼容（旧 fileID）
    ImportProgressGateway,
    ImportTaskService,
  ],
  exports: [ImportProgressGateway],
})
export class ImportsModule {}
