/**
 * AI Agent 工具定义
 */
import type { UserContext, ContentBlock } from './agent-types';

// 工具执行结果
export interface ToolResult {
  success: boolean;
  blocks: ContentBlock[];
  error?: string;
}

// 工具定义
export interface ToolDefinition {
  name: string;
  description: string;
  // 关键词触发
  keywords: string[];
  // 执行函数签名
  execute: (context: UserContext, params?: any) => Promise<ToolResult>;
}

// 意图类型
export type IntentType = 
  | 'analyze_weakness'      // 分析弱项
  | 'generate_plan'         // 生成学习计划
  | 'view_overall'          // 查看整体情况
  | 'check_progress'        // 检查进度/离上岸多远
  | 'study_advice'          // 学习建议
  | 'general_chat';         // 普通聊天

// 意图识别结果
export interface IntentResult {
  intent: IntentType;
  confidence: number;
  params?: Record<string, any>;
}

// 工具名称常量
export const TOOL_NAMES = {
  ANALYZE_WEAKNESS: 'analyze_weakness',
  GENERATE_PLAN: 'generate_plan',
  GET_STUDY_STATS: 'get_study_stats',
  CHECK_PROGRESS: 'check_progress',
} as const;
