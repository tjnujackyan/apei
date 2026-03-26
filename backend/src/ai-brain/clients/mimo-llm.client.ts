import type { ChatMessage } from '../interfaces/llm-client';
import { BaseLlmClient } from './base-llm.client';

interface MimoOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * 小米MiMo LLM客户端
 * ✅ 阶段二优化：继承BaseLlmClient，自动获得错误恢复能力
 * 文档: https://platform.xiaomimimo.com/#/docs/api/text-generation/openai-api
 */
export class MimoLlmClient extends BaseLlmClient {
  constructor(private readonly options: MimoOptions) {
    super(options.maxRetries ?? 3);
  }

  /**
   * ✅ 实现单次请求
   */
  /**
   * ✅ 实现单次请求（由基类处理重试和错误）
   */
  protected async executeSingleRequest(messages: ChatMessage[]): Promise<string> {
    console.log(`MimoLlmClient: Starting chat request with model ${this.options.model}`);
    
    const controller =
      typeof AbortController !== 'undefined'
        ? new AbortController()
        : undefined;
    
    if (controller && this.options.timeoutMs) {
      setTimeout(() => controller.abort(), this.options.timeoutMs);
    }

    const url = `${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        messages,
        temperature: 0.2,
        max_tokens: 4096,
      }),
      signal: controller?.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    
    // 记录token使用情况
    if (data.usage) {
      console.log(`MiMo API usage: ${JSON.stringify(data.usage)}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('Invalid MiMo response content');
    }
    
    return content;
  }
}
