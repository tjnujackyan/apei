export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * LLM调用结果（包含错误处理信息）
 * ✅ 阶段二优化：实现错误观察保留机制
 */
export interface LlmResult {
  /** 调用是否成功 */
  success: boolean;
  
  /** 成功时的响应内容 */
  content?: string;
  
  /** 失败时的错误信息 */
  error?: string;
  
  /** 观察结果（总是有值，用于上下文学习） */
  observation: string;
  
  /** 是否可重试 */
  retryable: boolean;
  
  /** HTTP状态码（如果适用） */
  statusCode?: number;
  
  /** 尝试次数 */
  attempts?: number;
}

/**
 * LLM客户端接口
 * ✅ 向后兼容设计：保留原有chat方法，添加新的chatWithRecovery方法
 */
export interface LlmClient {
  /**
   * 基础聊天方法（原有接口，保持向后兼容）
   * @deprecated 建议使用 chatWithRecovery 以获得更好的错误处理
   */
  chat(messages: ChatMessage[]): Promise<string>;
  
  /**
   * 带错误恢复的聊天方法（新增）
   * ✅ 返回详细的结果信息，不抛出错误
   * ✅ 支持自动重试和降级策略
   */
  chatWithRecovery?(messages: ChatMessage[]): Promise<LlmResult>;
}
