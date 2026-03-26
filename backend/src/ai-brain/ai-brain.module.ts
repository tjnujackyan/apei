import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiBrainService } from './ai-brain.service';
import { AiBrainController } from './ai-brain.controller';
import { LocalLlmClient } from './clients/local-llm.client';
import { LLM_CLIENT_TOKEN } from './ai-brain.tokens';
import { DoubaoLlmClient } from './clients/doubao-llm.client';
import { MimoLlmClient } from './clients/mimo-llm.client';
import { OhmyGptLlmClient } from './clients/ohmygpt-llm.client';
import { DeepSeekLlmClient } from './clients/deepseek-llm.client';
import { WrongNotebookModule } from '../wrong-notebook/wrong-notebook.module';
import { PracticeModule } from '../practice/practice.module';
import { UsersModule } from '../users/users.module';
import { StudyPlansModule } from '../study-plans/study-plans.module';
import { AgentService } from './services/agent.service';
import { ChatMemoryEntity } from './entities/chat-memory.entity';
import { ChatMemoryService } from './services/chat-memory.service';
import { UserGoalEntity } from './entities/user-goal.entity';
import { GoalTrackingService } from './services/goal-tracking.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([ChatMemoryEntity, UserGoalEntity]),
    WrongNotebookModule,
    forwardRef(() => PracticeModule),
    UsersModule,
    StudyPlansModule,
  ],
  controllers: [AiBrainController],
  providers: [
    {
      provide: LLM_CLIENT_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('llm.provider') || 'local';
        const baseUrl =
          config.get<string>('llm.baseUrl') ||
          'https://dashscope.aliyuncs.com/compatible-mode/v1';
        const model = config.get<string>('llm.model') || 'qwen-plus';
        const apiKey = config.get<string>('llm.apiKey') || '';
        const timeoutMs = config.get<number>('llm.timeoutMs') || 120000;
        
        // 根据provider选择对应的LLM客户端
        if (provider === 'doubao') {
          console.log('✅ Using Doubao LLM Client');
          return new DoubaoLlmClient({ baseUrl, model, apiKey, timeoutMs });
        }
        
        if (provider === 'mimo') {
          console.log('✅ Using Xiaomi MiMo LLM Client');
          return new MimoLlmClient({ baseUrl, model, apiKey, timeoutMs });
        }
        
        if (provider === 'ohmygpt') {
          console.log('✅ Using OhMyGPT LLM Client (Gemini 2.0)');
          const reasoningEffort = config.get<string>('llm.reasoningEffort') as any;
          return new OhmyGptLlmClient({ 
            baseUrl, 
            model, 
            apiKey, 
            timeoutMs,
            reasoningEffort: reasoningEffort || 'medium', // 默认使用中等推理
          });
        }
        
        if (provider === 'deepseek') {
          console.log('✅ Using DeepSeek LLM Client (V3)');
          return new DeepSeekLlmClient({ 
            baseUrl, 
            model, 
            apiKey, 
            timeoutMs,
          });
        }
        
        // 默认使用LocalLlmClient (支持任何OpenAI兼容API)
        console.log('✅ Using Local/Generic LLM Client');
        return new LocalLlmClient({ baseUrl, model, apiKey, timeoutMs });
      },
    },
    AiBrainService,
    AgentService,
    ChatMemoryService,
    GoalTrackingService,
  ],
  exports: [AiBrainService, AgentService, ChatMemoryService, GoalTrackingService, LLM_CLIENT_TOKEN],
})
export class AiBrainModule {}
