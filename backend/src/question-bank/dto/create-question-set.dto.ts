import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { QuestionSource } from '../entities/question-set.entity';

export class CreateQuestionSetDto {
  @IsString()
  @Length(1, 120)
  title: string;

  @IsString()
  @Length(1, 80)
  subject: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsIn(['imported', 'manual', 'builtin', 'ai-generated'])
  source?: QuestionSource;
}
