import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PracticeService } from './practice.service';
import { PracticeController } from './practice.controller';
import { PracticeSessionEntity } from './entities/practice-session.entity';
import { PracticeItemLogEntity } from './entities/practice-item-log.entity';
import { QuestionBankModule } from '../question-bank/question-bank.module';
import { WrongNotebookModule } from '../wrong-notebook/wrong-notebook.module';
import { SmartReviewModule } from '../smart-review/smart-review.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PracticeSessionEntity, PracticeItemLogEntity]),
    QuestionBankModule,
    WrongNotebookModule,
    forwardRef(() => SmartReviewModule),
  ],
  controllers: [PracticeController],
  providers: [PracticeService],
  exports: [PracticeService],
})
export class PracticeModule {}
