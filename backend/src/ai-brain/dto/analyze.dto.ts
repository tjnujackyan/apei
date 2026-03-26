import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class AnalyzeDto {
  @IsString()
  @Length(5, 200)
  objective: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  days?: number;

  @IsOptional()
  @IsObject()
  recentStats?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  constraints?: string[];
}
