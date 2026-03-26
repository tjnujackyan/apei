import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecordWrongDto {
  @IsUUID()
  questionSetId: string;

  @IsUUID()
  questionId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledgePointIds?: string[];

  @IsOptional()
  answerPayload?: any;
}
