import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgePointsService } from './knowledge-points.service';
import { KnowledgePointsController } from './knowledge-points.controller';
import { KnowledgePointEntity } from './entities/knowledge-point.entity';
import { SeedKnowledgePointsService } from './seeds/seed-knowledge-points.service';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgePointEntity])],
  controllers: [KnowledgePointsController],
  providers: [KnowledgePointsService, SeedKnowledgePointsService],
  exports: [KnowledgePointsService, SeedKnowledgePointsService],
})
export class KnowledgePointsModule {}

