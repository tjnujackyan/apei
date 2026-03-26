import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class StartSessionDto {
  @IsString()
  @Length(1, 120)
  questionSetId: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  questionIds?: string[];

  /**
   * 关联的复习会话ID
   * 如果此练习会话是智能复习生成的，则传入对应的 ReviewSession ID
   */
  @IsOptional()
  @IsString()
  reviewSessionId?: string;
}
