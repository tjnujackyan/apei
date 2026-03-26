import OpenAI from 'openai';
import type { ChatMessage } from '../interfaces/llm-client';
import { BaseLlmClient } from './base-llm.client';

interface DeepSeekOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * DeepSeek LLM Client
 * ✅ 阶段二优化：继承BaseLlmClient，自动获得错误恢复能力
 * 
 * DeepSeek V3 特点:
 * - 671B MoE 架构
 * - 128K 上下文窗口
 * - 中英文双语优化
 * - 成本效益高
 * 
 * 参考: https://platform.deepseek.com/api-docs
 */
export class DeepSeekLlmClient extends BaseLlmClient {
  private client: OpenAI;

  constructor(private readonly options: DeepSeekOptions) {
    super(options.maxRetries ?? 2);
    this.client = new OpenAI({
      baseURL: options.baseUrl,
      apiKey: options.apiKey,
      timeout: options.timeoutMs || 120000,
    });
  }

  /**
   * ✅ 实现单次请求（由基类处理重试）
   */
  protected async executeSingleRequest(messages: ChatMessage[]): Promise<string> {
    console.log(`DeepSeekLlmClient: Starting chat request with model ${this.options.model}`);

    const response = await this.client.chat.completions.create({
      model: this.options.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: 0.8,
      max_tokens: 8192,
      top_p: 0.95,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content received from DeepSeek');
    }

    // 打印 token 使用情况
    if (response.usage) {
      console.log(
        `DeepSeek API usage: prompt=${response.usage.prompt_tokens}, completion=${response.usage.completion_tokens}, total=${response.usage.total_tokens}`,
      );
    }

    console.log(`DeepSeek: Response received successfully (${content.length} chars)`);
    return content;
  }
}
