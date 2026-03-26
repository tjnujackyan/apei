import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class SubmitAnswerDto {
  @IsString()
  @Length(1, 120)
  questionId: string;

  @IsOptional()
  answerPayload?: Record<string, unknown>;

  @IsBoolean()
  isCorrect: boolean;

  @IsInt()
  @Min(0)
  timeSpentSeconds: number;

  /**
   * 关联的知识点ID数组
   * 可选，如果不提供则从题目中获取
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledgePointIds?: string[];
}
