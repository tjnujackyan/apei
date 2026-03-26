import OpenAI from 'openai';
import type { ChatMessage } from '../interfaces/llm-client';
import { BaseLlmClient } from './base-llm.client';

interface OhmyGptOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  maxRetries?: number;
}

/**
 * OhMyGPT LLM Client
 * ✅ 阶段二优化：继承BaseLlmClient，自动获得错误恢复能力
 * 参考: https://www.ohmygpt.com/docs/api
 */
export class OhmyGptLlmClient extends BaseLlmClient {
  private client: OpenAI;

  constructor(private readonly options: OhmyGptOptions) {
    super(options.maxRetries ?? 2);
    this.client = new OpenAI({
      baseURL: options.baseUrl,
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
    });
  }

  /**
   * ✅ 实现单次请求（错误由基类处理）
   */
  protected async executeSingleRequest(messages: ChatMessage[]): Promise<string> {
    console.log(`OhmyGptLlmClient: Starting chat request with model ${this.options.model}`);

    const response = await this.client.chat.completions.create({
      model: this.options.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      // 如果需要支持 reasoning_effort，可通过 extra_body 传递
      ...(this.options.reasoningEffort ? {
        extra_body: { reasoning_effort: this.options.reasoningEffort }
      } : {})
    } as any);

    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content received from OhMyGPT');
    }

    return content;
  }
}
