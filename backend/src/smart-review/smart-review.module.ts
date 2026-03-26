import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeStateEntity } from './entities/knowledge-state.entity';
import { ReviewSessionEntity } from './entities/review-session.entity';
import { KnowledgePointEntity } from '../knowledge-points/entities/knowledge-point.entity';
import { QuestionEntity } from '../question-bank/entities/question.entity';
import { QuestionSetEntity } from '../question-bank/entities/question-set.entity';
import { WrongQuestionLogEntity } from '../wrong-notebook/entities/wrong-question-log.entity';
import { PracticeItemLogEntity } from '../practice/entities/practice-item-log.entity';
import { WeaknessDetectorService } from './services/weakness-detector.service';
import { NewKnowledgeTrackerService } from './services/new-knowledge-tracker.service';
import { QuestionSelectorService } from './services/question-selector.service';
import { QuestionTransformerService } from './services/question-transformer.service';
import { ReviewQuizGeneratorService } from './services/review-quiz-generator.service';
import { KnowledgeStateService } from './services/knowledge-state.service';
import { ReviewEffectTrackerService } from './services/review-effect-tracker.service';
import { SmartReviewController } from './smart-review.controller';
import { AiBrainModule } from '../ai-brain/ai-brain.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeStateEntity,
      ReviewSessionEntity,
      KnowledgePointEntity,
      QuestionEntity,
      QuestionSetEntity,
      WrongQuestionLogEntity,
      PracticeItemLogEntity,
    ]),
    forwardRef(() => AiBrainModule),
  ],
  providers: [
    WeaknessDetectorService,
    NewKnowledgeTrackerService,
    QuestionSelectorService,
    QuestionTransformerService,
    ReviewQuizGeneratorService,
    KnowledgeStateService,
    ReviewEffectTrackerService,
  ],
  controllers: [SmartReviewController],
  exports: [
    WeaknessDetectorService,
    NewKnowledgeTrackerService,
    QuestionSelectorService,
    QuestionTransformerService,
    ReviewQuizGeneratorService,
    KnowledgeStateService,
    ReviewEffectTrackerService,
  ],
})
export class SmartReviewModule {}
