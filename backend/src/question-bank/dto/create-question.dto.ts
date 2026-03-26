import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { QuestionType } from '../entities/question.entity';

class QuestionOptionInput {
  @IsString()
  @Length(1, 5)
  label: string;

  @IsString()
  @Length(1, 500)
  content: string;

  @IsBoolean()
  isCorrect: boolean;
}

export class CreateQuestionDto {
  @IsString()
  @Length(1, 500)
  stem: string;

  @IsIn(['single', 'multiple', 'true_false'])
  type: QuestionType;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInput)
  options: QuestionOptionInput[];

  @IsArray()
  @ArrayMinSize(0)
  @IsString({ each: true })
  knowledgeTags: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  knowledgePointIds?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  answerExplanation?: string;

  @IsOptional()
  @IsNumber()
  difficulty?: number;
}
