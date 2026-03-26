/**
 * 薄弱点信息
 */
export interface WeaknessPoint {
  knowledgePointId: string;
  knowledgePointName: string;
  errorRate: number;
  errorCount: number;
  totalAttempts: number;
  lastErrorAt: Date;
  weaknessScore: number;
  relatedQuestionIds: string[];
}

/**
 * 新学知识项
 * 用于追踪用户最近学习但练习次数少的内容
 */
export interface NewKnowledgeItem {
  knowledgePointId: string;
  knowledgePointName: string;
  questionCount: number;      // 相关题目数量
  practiceCount: number;      // 已练习次数
  uploadedAt: Date;           // 上传时间
  questionIds: string[];      // 相关题目ID
}

/**
 * 复习状态概览 DTO
 */
export interface ReviewStatusDto {
  hasWeakness: boolean;
  weaknessCount: number;
  topWeaknesses: WeaknessPoint[];
  hasNewKnowledge: boolean;
  newKnowledgeCount: number;
  lastReviewAt: Date | null;
  suggestedReviewCount: number;
}

/**
 * 知识状态 DTO
 */
export interface KnowledgeStateDto {
  knowledgePointId: string;
  knowledgePointName: string;
  masteryScore: number;
  totalAttempts: number;
  correctCount: number;
  consecutiveCorrect: number;
  lastPracticeAt: Date | null;
  nextReviewAt: Date | null;
}

/**
 * 复习题库生成结果
 */
export interface ReviewQuizResultDto {
  questionSetId: string;
  reviewSessionId: string;
  summary: {
    totalQuestions: number;
    weaknessQuestions: number;
    newKnowledgeQuestions: number;
    transformedQuestions: number;
    coveredKnowledgePoints: string[];
    estimatedMinutes: number;
  };
}
