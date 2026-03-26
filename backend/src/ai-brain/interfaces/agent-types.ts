/**
 * AI Agent 富消息类型定义
 */

// 消息内容块类型
export type ContentBlockType = 'text' | 'progress_card' | 'action_buttons' | 'stats_card' | 'plan_preview';

// 文本块
export interface TextBlock {
  type: 'text';
  content: string;
}

// 进度条项
export interface ProgressItem {
  label: string;      // 标签名称，如 "树与图"
  value: number;      // 进度值 0-100
  color?: string;     // 可选颜色
}

// 进度卡片块
export interface ProgressCardBlock {
  type: 'progress_card';
  title: string;      // 卡片标题，如 "弱项分布"
  items: ProgressItem[];
}

// 操作按钮
export interface ActionButton {
  id: string;         // 按钮ID，用于回调
  label: string;      // 按钮文本
  action: string;     // 动作类型: 'generate_plan' | 'view_detail' | 'navigate'
  payload?: any;      // 动作参数
  primary?: boolean;  // 是否主按钮
}

// 按钮块
export interface ActionButtonsBlock {
  type: 'action_buttons';
  buttons: ActionButton[];
}

// 统计数据项
export interface StatItem {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'stable';
}

// 统计卡片块
export interface StatsCardBlock {
  type: 'stats_card';
  title: string;
  stats: StatItem[];
}

// 学习计划预览块
export interface PlanPreviewBlock {
  type: 'plan_preview';
  title: string;
  days: number;
  summary: string;
  planId?: string;
}

// 内容块联合类型
export type ContentBlock = TextBlock | ProgressCardBlock | ActionButtonsBlock | StatsCardBlock | PlanPreviewBlock;

// AI Agent 响应
export interface AgentResponse {
  // 消息内容块列表（支持混合类型）
  blocks: ContentBlock[];
  
  // 快捷问题建议
  suggestions?: string[];
  
  // 建议的TTS情感（用于语音合成，如 happy, sad, excited, encouraging 等）
  emotion?: string;

  // 是否需要后续对话
  requiresFollowUp?: boolean;
  
  // 内部状态（如意图、工具调用结果）
  _meta?: {
    intent?: string;
    toolsCalled?: string[];
    context?: any;
  };
}

// 用户上下文（用于工具调用）
export interface UserContext {
  userId: string;
  displayName?: string;  // 用户显示名，用于个性化称呼
  gender?: 'male' | 'female' | 'other' | 'unknown';  // 用户性别
  persona?: string;
  targetSchool?: string;
  targetMajor?: string;
}
