import type { ChatMessage } from '../interfaces/llm-client';
import { BaseLlmClient } from './base-llm.client';

interface LocalLlmClientOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * 本地/通用 OpenAI兼容 LLM客户端
 * ✅ 阶段二优化：继承BaseLlmClient，自动获得错误恢复能力
 */
export class LocalLlmClient extends BaseLlmClient {
  constructor(private readonly options: LocalLlmClientOptions) {
    super(options.maxRetries ?? 2);
  }

  /**
   * ✅ 实现单次请求
   */
  protected async executeSingleRequest(messages: ChatMessage[]): Promise<string> {
    const url = `${this.options.baseUrl}/v1/chat/completions`;
    const controller =
      typeof AbortController !== 'undefined'
        ? new AbortController()
        : undefined;

    if (controller && this.options.timeoutMs) {
      setTimeout(() => controller.abort(), this.options.timeoutMs);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.options.apiKey
          ? { Authorization: `Bearer ${this.options.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        model: this.options.model,
        messages,
        temperature: 0.2,
      }),
      signal: controller?.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('Invalid LLM response content');
    }
    return content;
  }
}
