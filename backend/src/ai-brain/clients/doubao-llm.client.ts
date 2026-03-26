import type { ChatMessage } from '../interfaces/llm-client';
import { BaseLlmClient } from './base-llm.client';

interface DoubaoOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number; // 最大重试次数（默认2）
}

/**
 * Doubao (豆包) LLM客户端
 * ✅ 阶段二优化：继承BaseLlmClient，自动获得错误恢复能力
 */
export class DoubaoLlmClient extends BaseLlmClient {
  constructor(private readonly options: DoubaoOptions) {
    super(options.maxRetries ?? 2);
  }

  /**
   * ✅ 实现单次请求（由基类的错误恢复机制调用）
   * 只负责执行一次LLM调用，失败时抛出错误由基类处理
   */
  protected async executeSingleRequest(messages: ChatMessage[]): Promise<string> {
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
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number; cached_tokens?: number };
    };

    const content = data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      throw new Error('Empty or invalid response content');
    }

    return content;
  }
}
