import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import configuration from './common/config/configuration';
import { validateEnv } from './common/config/validation';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { QuestionBankModule } from './question-bank/question-bank.module';
import { ImportsModule } from './imports/imports.module';
import { AiBrainModule } from './ai-brain/ai-brain.module';
import { DatabaseModule } from './database/database.module';
import { PracticeModule } from './practice/practice.module';
import { WrongNotebookModule } from './wrong-notebook/wrong-notebook.module';
import { TtsModule } from './tts/tts.module';
import { AsrModule } from './asr/asr.module';
import { KnowledgePointsModule } from './knowledge-points/knowledge-points.module';
import { StudyPlansModule } from './study-plans/study-plans.module';
import { SmartReviewModule } from './smart-review/smart-review.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // ServeStaticModule removed in favor of main.ts manual setup to ensure priority
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    QuestionBankModule,
    ImportsModule,
    PracticeModule,
    WrongNotebookModule,
    AiBrainModule,
    TtsModule,
    AsrModule,
    KnowledgePointsModule,
    StudyPlansModule,
    SmartReviewModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
