import { IsNumber, IsOptional, IsString, Length, IsIn, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { AssistantPersona, UserGender, ChatDiyConfig } from '../user.entity';

/**
 * 聊天 DIY 配置 DTO
 */
export class ChatDiyConfigDto implements ChatDiyConfig {
  @IsOptional()
  @IsString()
  customAvatarUrl?: string;

  @IsOptional()
  @IsString()
  customBackgroundUrl?: string;

  @IsOptional()
  @IsString()
  avatarStorageKey?: string;

  @IsOptional()
  @IsString()
  bgStorageKey?: string;

  @IsOptional()
  @IsNumber()
  bubbleStyle?: number;

  @IsOptional()
  @IsNumber()
  fontStyle?: number;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  displayName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'other', 'unknown'])
  gender?: UserGender;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  targetSchool?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  targetMajor?: string;

  @IsOptional()
  @IsNumber()
  targetScore?: number;

  @IsOptional()
  @IsString()
  subjects?: string;

  @IsOptional()
  @IsString()
  dailyStudyHours?: string;

  @IsOptional()
  @IsIn(['neutral', 'duzhe_xiaoxin', 'nana_zejie'])
  persona?: AssistantPersona;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ChatDiyConfigDto)
  chatDiyConfig?: ChatDiyConfigDto;
}
