import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateQuestionDto } from '../../question-bank/dto/create-question.dto';

export class CreateImportJobDto {
  @IsString()
  @Length(1, 200)
  filename: string;

  @IsString()
  @Length(1, 120)
  questionSetTitle: string;

  @IsString()
  @Length(1, 80)
  subject: string;

  @IsOptional()
  @IsString()
  fileID?: string; // COS URL 或其他文件 URL

  @IsOptional()
  @IsString()
  fileData?: string; // Base64 编码的文件数据（备用方案，主要使用 multipart/form-data 上传）

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions?: CreateQuestionDto[];
}
