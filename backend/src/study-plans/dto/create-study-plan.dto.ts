import {
  IsString,
  IsOptional,
  IsDateString,
  IsIn,
  Length,
  IsObject,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateTaskDto {
  @IsString()
  @Length(1, 200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  taskDate: string;

  @IsOptional()
  @IsIn(['review', 'practice', 'weak_focus', 'mock_exam', 'custom'])
  taskType?: string;

  @IsOptional()
  @IsObject()
  metadata?: any;
}

export class CreateStudyPlanDto {
  @IsString()
  @Length(1, 200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  planType?: string;

  @IsOptional()
  @IsString()
  subjectCode?: string;

  @IsOptional()
  @IsObject()
  metadata?: any;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  tasks?: CreateTaskDto[];
}

