import {
  Controller,
  Post,
  UseInterceptors,
  UseGuards,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AsrService } from './asr.service';
import { ApiConsumes, ApiBody, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('ASR')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller('asr')
export class AsrController {
  constructor(private readonly asrService: AsrService) {}

  @Post('transcribe')
  @ApiOperation({ summary: 'Transcribe audio file to text' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async transcribe(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 10 }), // 10MB
          // Accept typical audio formats. WeChat often sends .mp3 or .aac or .wav
          // Note: FileTypeValidator regex can be tricky with MIME types, so we might want to be lenient for MVP
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.asrService.transcribe(file);
  }
}
