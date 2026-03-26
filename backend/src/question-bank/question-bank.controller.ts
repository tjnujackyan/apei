import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { QuestionBankService } from './question-bank.service';
import { QuestionBankMigrationService } from './question-bank-migration.service';
import { CreateQuestionSetDto } from './dto/create-question-set.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('question-sets')
export class QuestionBankController {
  constructor(
    private readonly questionBankService: QuestionBankService,
    private readonly migrationService: QuestionBankMigrationService,
  ) {}

  @Post()
  createSet(
    @Body() dto: CreateQuestionSetDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.questionBankService.createQuestionSet(dto, user.userId);
  }

  @Get()
  listSets(@CurrentUser() user: RequestUser) {
    return this.questionBankService.listQuestionSets(user.userId);
  }

  @Delete(':id')
  deleteSet(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.questionBankService.deleteQuestionSet(id, user.userId);
  }

  @Get(':id/stats')
  getSetStats(@Param('id') setId: string, @CurrentUser() user: RequestUser) {
    return this.questionBankService.getSetStats(setId, user.userId);
  }

  @Post(':id/questions')
  createQuestion(
    @Param('id') setId: string,
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.questionBankService.createQuestion(setId, dto, user.userId);
  }

  @Get(':id/questions')
  listQuestions(@Param('id') setId: string, @CurrentUser() user: RequestUser) {
    return this.questionBankService.listQuestions(setId, user.userId);
  }

  /**
   * 迁移当前用户的知识点数据
   * 将所有非 UUID 格式的知识点 ID 转换为 UUID
   * 包括 questions 表和 wrong_question_logs 表
   */
  @Post('migrate-knowledge-points')
  migrateKnowledgePoints(@CurrentUser() user: RequestUser) {
    return this.migrationService.migrateAll(user.userId);
  }
}
