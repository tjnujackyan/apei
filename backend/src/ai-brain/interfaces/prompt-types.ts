/**
 * 提示词配置类型定义
 * 用于实现上下文缓存优化：分离静态和动态内容
 */

/**
 * 稳定的提示词配置
 * - staticSystemPrompt: 永远不变的系统提示（可被KV缓存）
 * - 动态信息通过 buildDynamicContext 构建，追加到消息末尾
 */
export interface StablePromptConfig {
  /** 静态系统提示（永不改变，可被KV缓存） */
  staticSystemPrompt: string;
  
  /** 动态上下文构建函数（返回追加到末尾的上下文） */
  buildDynamicContext?: (context: DynamicContextInput) => string;
}

/**
 * 动态上下文输入
 */
export interface DynamicContextInput {
  /** 用户ID */
  userId?: string;
  
  /** 距离目标的天数 */
  daysLeft?: number;
  
  /** 用户统计数据 */
  stats?: {
    totalWrong?: number;
    topKnowledgePoints?: Array<{ name: string; count: number }>;
    topTags?: Array<{ name: string; count: number }>;
  };
  
  /** 用户显示名称 */
  displayName?: string;
  
  /** 用户性别 */
  gender?: string;
  
  /** 人设key */
  personaKey?: string;
  
  /** 其他动态数据 */
  [key: string]: any;
}

/**
 * 人设配置
 */
export interface PersonaConfig {
  /** 人设名称 */
  name: string;
  
  /** 自称 */
  selfRef: string;
  
  /** 静态系统提示（不包含动态信息） */
  staticSystemPrompt: string;
  
  /** 问候语列表 */
  greetings: string[];
  
  /** 鼓励语列表 */
  encouragements: string[];
  
  /** emoji列表 */
  emojis: string[];
  
  /** 语气风格描述 */
  style: string;
}

