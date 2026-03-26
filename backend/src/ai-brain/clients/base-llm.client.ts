import type { ChatMessage, LlmClient, LlmResult } from '../interfaces/llm-client';

/**
 * LLM客户端基类
 * ✅ 阶段二优化：提供通用的错误恢复和重试逻辑
 * 所有LLM客户端可以继承此类来获得一致的错误处理能力
 */
export abstract class BaseLlmClient implements LlmClient {
  protected readonly maxRetries: number;

  constructor(maxRetries: number = 2) {
    this.maxRetries = maxRetries;
  }

  /**
   * 子类需要实现的核心方法：单次LLM调用
   * @returns 成功时返回内容，失败时抛出错误
   */
  protected abstract executeSingleRequest(messages: ChatMessage[]): Promise<string>;

  /**
   * ✅ 带错误恢复的聊天方法（通用实现）
   * 所有子类自动获得此能力
   */
  async chatWithRecovery(messages: ChatMessage[]): Promise<LlmResult> {
    let attempts = 0;
    let lastError: any = null;

    while (attempts < this.maxRetries) {
      attempts++;
      console.log(`[${this.constructor.name}] Attempt ${attempts}/${this.maxRetries}`);

      try {
        const content = await this.executeSingleRequest(messages);

        // ✅ 成功
        return {
          success: true,
          content,
          observation: `✓ AI响应成功 (${attempts > 1 ? `重试${attempts - 1}次后` : '首次尝试'})`,
          retryable: false,
          attempts,
        };
      } catch (error: any) {
        lastError = error;
        console.warn(`[${this.constructor.name}] Attempt ${attempts} failed:`, error.message);

        // 判断是否可重试
        const retryable = this.isRetryable(error);

        if (!retryable || attempts >= this.maxRetries) {
          // ✅ 不可重试或达到最大重试次数
          return {
            success: false,
            error: error.message,
            observation: this.buildErrorObservation(error, attempts, retryable),
            retryable,
            statusCode: this.extractStatusCode(error),
            attempts,
          };
        }

        // 指数退避重试
        await this.sleep(1000 * attempts);
      }
    }

    // ✅ 所有重试都失败了
    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      observation: `经过${attempts}次尝试后仍然失败: ${lastError?.message || '未知错误'}`,
      retryable: true,
      attempts,
    };
  }

  /**
   * 原有方法：保持向后兼容
   * 内部调用 chatWithRecovery 并提取content或抛出错误
   */
  async chat(messages: ChatMessage[]): Promise<string> {
    const result = await this.chatWithRecovery(messages);

    if (!result.success) {
      // ✅ 保持旧行为：失败时抛出错误
      throw new Error(result.error || 'LLM request failed');
    }

    return result.content!;
  }

  /**
   * 判断错误是否可重试
   * 子类可以重写此方法以自定义重试逻辑
   */
  protected isRetryable(error: any): boolean {
    // 网络错误通常可重试
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // HTTP 5xx错误可重试
    if (error.message && /HTTP [5]\d{2}/.test(error.message)) {
      return true;
    }

    // 包含timeout、network等关键词的错误可重试
    const retryableKeywords = ['timeout', 'network', 'connection', 'ECONNRESET', 'ENOTFOUND'];
    const errorMsg = error.message?.toLowerCase() || '';
    return retryableKeywords.some(keyword => errorMsg.includes(keyword));
  }

  /**
   * 提取HTTP状态码
   */
  protected extractStatusCode(error: any): number | undefined {
    // 尝试从错误消息中提取状态码
    const match = error.message?.match(/HTTP (\d{3})/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * 构建友好的错误观察信息
   */
  protected buildErrorObservation(error: any, attempts: number, retryable: boolean): string {
    const statusCode = this.extractStatusCode(error);

    if (statusCode) {
      if (statusCode >= 500) {
        return `服务器错误(HTTP ${statusCode})，服务暂时不可用。建议稍后重试。`;
      } else if (statusCode === 429) {
        return `请求过于频繁(HTTP ${statusCode})，已达到API限流。请稍后再试。`;
      } else if (statusCode >= 400) {
        return `请求错误(HTTP ${statusCode})，可能是参数或配置有误。请检查设置。`;
      }
    }

    if (error.code === 'ECONNREFUSED') {
      return '无法连接到AI服务，请检查网络或服务配置。';
    }

    if (error.code === 'ETIMEDOUT') {
      return '请求超时，AI服务响应较慢。建议稍后重试。';
    }

    // 通用错误信息
    return `AI服务暂时不可用: ${error.message}。${retryable ? '可以稍后重试。' : '请检查配置。'}`;
  }

  /**
   * 辅助方法：延迟
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

