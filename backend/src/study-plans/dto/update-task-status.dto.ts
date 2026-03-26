import { IsIn, IsOptional, IsInt, Min, IsObject } from 'class-validator';

export class UpdateTaskStatusDto {
  @IsIn(['pending', 'in_progress', 'completed', 'skipped'])
  status: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualMinutes?: number;

  @IsOptional()
  @IsObject()
  metadata?: {
    completedQuestionCount?: number;
    correctRate?: number;
  };
}

