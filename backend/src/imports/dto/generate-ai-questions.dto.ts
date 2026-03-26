import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class GenerateAiQuestionsDto {
  @IsString()
  @Length(1, 120)
  questionSetTitle: string;

  @IsString()
  @Length(1, 80)
  subject: string;

  @IsOptional()
  @IsString()
  filename?: string; // 文件名

  @IsOptional()
  @IsString()
  fileID?: string; // COS URL 或其他文件 URL

  @IsOptional()
  @IsString()
  fileData?: string; // Base64 编码的文件数据（备用方案，主要使用 multipart/form-data 上传）

  @IsInt()
  @Min(1)
  @Max(50)
  @Transform(({ value }) => typeof value === 'number' ? value : parseInt(value, 10))
  count: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Transform(({ value }) => {
    // 如果已经是数组（JSON body），直接返回
    if (Array.isArray(value)) {
      return value;
    }
    // 如果是字符串（form-data），按逗号分割
    if (typeof value === 'string') {
      return value.split(',').filter((s) => s.trim().length > 0);
    }
    return value;
  })
  types: string[]; // ['single', 'multiple', 'true_false']

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  @Transform(({ value }) => {
    if (!value) return value;
    return typeof value === 'number' ? value : parseInt(value, 10);
  })
  difficulty?: number;
}
