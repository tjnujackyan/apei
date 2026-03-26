import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WrongNotebookService } from './wrong-notebook.service';
import { RecordWrongDto } from './dto/record-wrong.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('wrong-notebook')
export class WrongNotebookController {
  constructor(private readonly wrongNotebookService: WrongNotebookService) {}

  @Post('record')
  record(@Body() dto: RecordWrongDto, @CurrentUser() user: RequestUser) {
    return this.wrongNotebookService.recordWrong(
      user.userId,
      dto.questionSetId,
      dto.questionId,
      dto.tags,
      dto.knowledgePointIds,
      dto.answerPayload,
    );
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.wrongNotebookService.listWrongs(user.userId);
  }

  @Get('stats')
  stats(@CurrentUser() user: RequestUser) {
    return this.wrongNotebookService.getStats(user.userId);
  }

  @Get('today')
  getTodayWrongs(@CurrentUser() user: RequestUser) {
    return this.wrongNotebookService.getTodayWrongs(user.userId);
  }

  @Get('tree')
  getKnowledgePointTree(@CurrentUser() user: RequestUser) {
    return this.wrongNotebookService.getKnowledgePointTree(user.userId);
  }

  @Get('by-knowledge-point/:id')
  getByKnowledgePoint(
    @CurrentUser() user: RequestUser,
    @Param('id') knowledgePointId: string,
  ) {
    return this.wrongNotebookService.getWrongsByKnowledgePoint(
      user.userId,
      knowledgePointId,
    );
  }
  
  @Get('sets')
  getQuestionSetStats(@CurrentUser() user: RequestUser) {
    return this.wrongNotebookService.getQuestionSetStats(user.userId);
  }

  @Get('by-set/:id')
  getWrongsBySet(
    @CurrentUser() user: RequestUser,
    @Param('id') questionSetId: string,
  ) {
    return this.wrongNotebookService.getWrongsByQuestionSet(
      user.userId,
      questionSetId,
    );
  }

  @Get('weakness-analysis')
  analyzeWeaknesses(
    @CurrentUser() user: RequestUser,
    @Query('subjectCode') subjectCode?: string,
    @Query('topN') topN?: string,
  ) {
    return this.wrongNotebookService.analyzeWeaknesses(user.userId, {
      subjectCode,
      topN: topN ? parseInt(topN, 10) : 10,
    });
  }
}
