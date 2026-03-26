/**
 * 弱项分析结果
 */
export interface WeaknessAnalysisResult {
  knowledgePointId: string;
  knowledgePointName: string;
  level: number;
  subjectCode: string;
  
  // 统计数据
  wrongCount: number; // 错题数
  totalAttempts: number; // 总尝试次数
  errorRate: number; // 错误率 (0-1)
  
  // 权重计算
  weight: number; // 综合权重 (0-100)
  importance: number; // 重要度 (0-100)
  urgency: number; // 紧迫度 (0-100)
  
  // 分析建议
  priority: 'critical' | 'high' | 'medium' | 'low';
  suggestedDays: number; // 建议专项训练天数
  suggestedQuestionCount: number; // 建议练习题数
  
  // 元数据
  lastWrongAt?: Date;
  recentTrend?: 'improving' | 'stable' | 'worsening';
}

export interface WeaknessAnalysisOptions {
  minWrongCount?: number; // 最小错题数阈值（默认3）
  topN?: number; // 返回前N个弱项（默认10）
  subjectCode?: string; // 限定科目
  timeRange?: {
    start?: Date;
    end?: Date;
  };
}

