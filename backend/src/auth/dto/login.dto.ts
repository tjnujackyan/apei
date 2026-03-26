import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import type { AssistantPersona } from '../../users/user.entity';

export class LoginDto {
  @IsString()
  @Length(3, 64)
  externalId: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @Length(11, 11)
  phoneNumber?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @Length(6, 6)
  smsCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  displayName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  targetSchool?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  targetMajor?: string;

  @IsOptional()
  @IsIn(['neutral', 'duzhe_xiaoxin', 'nana_zejie'])
  persona?: AssistantPersona;
}
