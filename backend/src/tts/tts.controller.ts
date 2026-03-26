import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { TtsService } from './tts.service';
import { TtsRequestDto } from './dto/tts-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('tts')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller('tts')
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  @Post('synthesize')
  synthesize(@Body() dto: TtsRequestDto) {
    return this.ttsService.synthesize(dto);
  }
}
