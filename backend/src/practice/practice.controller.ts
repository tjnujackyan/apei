import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PracticeService } from './practice.service';
import { StartSessionDto } from './dto/start-session.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('practice')
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Post('sessions')
  startSession(@Body() dto: StartSessionDto, @CurrentUser() user: RequestUser) {
    return this.practiceService.startSession(dto, user.userId);
  }

  @Post('sessions/:id/answers')
  submitAnswer(
    @Param('id') sessionId: string,
    @Body() dto: SubmitAnswerDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.practiceService.submitAnswer(sessionId, user.userId, dto);
  }

  @Post('sessions/:id/complete')
  completeSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.practiceService.completeSession(sessionId, user.userId);
  }

  @Get('sessions/:id')
  getSession(@Param('id') sessionId: string, @CurrentUser() user: RequestUser) {
    return this.practiceService.getSessionDetail(sessionId, user.userId);
  }

  @Get('sessions')
  listSessions(@CurrentUser() user: RequestUser) {
    return this.practiceService.listSessions(user.userId);
  }
}
