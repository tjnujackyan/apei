import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuestionBankService } from './question-bank.service';
import { QuestionBankController } from './question-bank.controller';
import { QuestionSetEntity } from './entities/question-set.entity';
import { QuestionEntity } from './entities/question.entity';
import { PracticeSessionEntity } from '../practice/entities/practice-session.entity';
import { ReviewSessionEntity } from '../smart-review/entities/review-session.entity';
import { KnowledgePointEntity } from '../knowledge-points/entities/knowledge-point.entity';
import { QuestionBankMigrationService } from './question-bank-migration.service';
import { WrongQuestionLogEntity } from '../wrong-notebook/entities/wrong-question-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    QuestionSetEntity, 
    QuestionEntity, 
    PracticeSessionEntity, 
    ReviewSessionEntity, 
    KnowledgePointEntity,
    WrongQuestionLogEntity,
  ])],
  controllers: [QuestionBankController],
  providers: [QuestionBankService, QuestionBankMigrationService],
  exports: [QuestionBankService, QuestionBankMigrationService],
})
export class QuestionBankModule {}
