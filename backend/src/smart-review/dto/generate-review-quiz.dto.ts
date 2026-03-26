import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * 生成复习题库请求 DTO
 */
export class GenerateReviewQuizDto {
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(30)
  totalCount?: number = 20;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weaknessRatio?: number = 0.6;

  @IsOptional()
  @IsBoolean()
  enableTransform?: boolean = false;

  @IsOptional()
  @IsString()
  subjectCode?: string;
}
