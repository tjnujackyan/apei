import { IsString, IsUUID } from 'class-validator';

/**
 * 题目变式生成请求 DTO
 */
export class TransformQuestionDto {
  @IsUUID()
  @IsString()
  questionId: string;
}

/**
 * 变式题结果
 */
export interface TransformedQuestionDto {
  originalQuestionId: string;
  stem: string;
  type: string;
  options: {
    label: string;
    content: string;
    isCorrect: boolean;
  }[];
  knowledgeTags: string[];
  answerExplanation: string;
  difficulty: number;
  sourceInfo: string;
}
