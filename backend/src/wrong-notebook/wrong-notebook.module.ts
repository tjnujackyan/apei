import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WrongNotebookService } from './wrong-notebook.service';
import { WrongNotebookController } from './wrong-notebook.controller';
import { WrongQuestionLogEntity } from './entities/wrong-question-log.entity';
import { KnowledgePointEntity } from '../knowledge-points/entities/knowledge-point.entity';
import { QuestionEntity } from '../question-bank/entities/question.entity';
import { QuestionSetEntity } from '../question-bank/entities/question-set.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WrongQuestionLogEntity,
      KnowledgePointEntity,
      QuestionEntity,
      QuestionSetEntity,
    ]),
  ],
  providers: [WrongNotebookService],
  controllers: [WrongNotebookController],
  exports: [WrongNotebookService],
})
export class WrongNotebookModule {}
