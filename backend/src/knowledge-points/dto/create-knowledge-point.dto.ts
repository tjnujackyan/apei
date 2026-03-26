import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  Length,
  IsBoolean,
  IsObject,
  IsUUID,
} from 'class-validator';

export class CreateKnowledgePointDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(3)
  level: number;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  subjectCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsObject()
  metadata?: {
    difficulty?: number;
    importance?: number;
    examFrequency?: number;
    tags?: string[];
  };
}

