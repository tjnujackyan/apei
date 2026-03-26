import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudyPlansService } from './study-plans.service';
import { StudyPlansController } from './study-plans.controller';
import { StudyPlanEntity } from './entities/study-plan.entity';
import { StudyTaskEntity } from './entities/study-task.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StudyPlanEntity, StudyTaskEntity])],
  controllers: [StudyPlansController],
  providers: [StudyPlansService],
  exports: [StudyPlansService],
})
export class StudyPlansModule {}

