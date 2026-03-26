import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AiBrainService } from './ai-brain.service';
import { AgentService } from './services/agent.service';
import { ChatMemoryService } from './services/chat-memory.service';
import { AnalyzeDto } from './dto/analyze.dto';
import { ChatDto } from './dto/chat.dto';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('ai-brain')
export class AiBrainController {
  constructor(
    private readonly aiBrainService: AiBrainService,
    private readonly agentService: AgentService,
    private readonly chatMemoryService: ChatMemoryService,
  ) {}

  @Post('analyze')
  analyze(@Body() dto: AnalyzeDto, @CurrentUser() user: RequestUser) {
    return this.aiBrainService.analyze(dto, user);
  }

  @Post('chat')
  chat(@Body() dto: ChatDto, @CurrentUser() user: RequestUser) {
    return this.aiBrainService.chat(dto, user);
  }

  @Post('plan')
  generatePlan(@Body() dto: GeneratePlanDto, @CurrentUser() user: RequestUser) {
    return this.aiBrainService.generateStudyPlan(dto, user);
  }

  /**
   * Agent模式：智能对话（带工具调用和富消息）
   */
  @Post('agent')
  async agentChat(
    @Body() dto: { message: string; history?: { role: string; content: string }[] },
    @CurrentUser() user: RequestUser,
  ) {
    // 转换 history 类型
    const history = (dto.history || []).map(h => ({
      role: h.role as 'system' | 'user' | 'assistant',
      content: h.content,
    }));
    
    return this.agentService.processMessage(
      dto.message,
      {
        userId: user.userId,
        persona: user.persona,
      },
      history,
    );
  }

  /**
   * 获取对话历史记录
   */
  @Get('history')
  async getChatHistory(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const memories = await this.chatMemoryService.getRecentHistory(user.userId, limitNum);
    
    // 转换为前端消息格式
    return memories.map(m => {
      const msg: any = {
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      };
      
      // 如果有元数据（包含语音信息），则合并返回
      if (m.metadata) {
        if (m.metadata.type) msg.type = m.metadata.type;
        if (m.metadata.audioUrl) msg.audioUrl = m.metadata.audioUrl;
        if (m.metadata.duration) msg.duration = m.metadata.duration;
        if (m.metadata.blocks) msg.blocks = m.metadata.blocks;
      }
      
      return msg;
    });
  }

  /**
   * 更新语音消息状态（前端TTS成功后回调）
   */
  @Post('voice-status')
  async updateVoiceStatus(
    @CurrentUser() user: RequestUser,
    @Body() dto: { audioUrl: string; duration: number },
  ) {
    return this.chatMemoryService.updateLatestAssistantMessage(user.userId, {
      type: 'voice',
      audioUrl: dto.audioUrl,
      duration: dto.duration
    });
  }
}
