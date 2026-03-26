import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
  IsUrl,
  IsNotEmpty,
  IsIn,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsString()
  APP_NAME?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsUrl()
  LLM_BASE_URL?: string;

  @IsOptional()
  @IsString()
  LLM_MODEL?: string;

  @IsOptional()
  @IsString()
  LLM_API_KEY?: string;

  @IsOptional()
  @IsInt()
  LLM_TIMEOUT_MS?: number;

  @IsOptional()
  @IsIn(['local', 'qwen', 'doubao', 'mimo', 'ohmygpt', 'deepseek'])
  LLM_PROVIDER?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https', 'wss', 'ws'], require_tld: false })
  TTS_BASE_URL?: string;

  @IsOptional()
  @IsString()
  TTS_MODEL?: string;

  @IsOptional()
  @IsString()
  TTS_VOICE?: string;

  @IsOptional()
  @IsString()
  TTS_API_KEY?: string;

  @IsOptional()
  @IsInt()
  TTS_TIMEOUT_MS?: number;

  @IsOptional()
  @IsString()
  DB_HOST?: string;

  @IsOptional()
  @IsInt()
  DB_PORT?: number;

  @IsOptional()
  @IsString()
  DB_USER?: string;

  @IsOptional()
  @IsString()
  DB_PASSWORD?: string;

  @IsOptional()
  @IsString()
  DB_NAME?: string;

  @IsOptional()
  @IsIn(['local', 'official'])
  MINERU_TYPE?: string;

  @IsOptional()
  @IsString()
  MINERU_PARSE_URL?: string;

  @IsOptional()
  @IsString()
  MINERU_API_KEY?: string;

  @IsOptional()
  @IsString()
  WXCLOUD_BUCKET?: string;

  @IsOptional()
  @IsString()
  WXCLOUD_REGION?: string;

  @IsOptional()
  @IsString()
  SQLITE_PATH?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const withDefaults = {
    JWT_SECRET: config.JWT_SECRET ?? 'dev-secret',
    ...config,
  };

  const validated = plainToInstance(EnvironmentVariables, withDefaults, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length) {
    throw new Error(
      `Environment validation failed: ${errors
        .map((err) => Object.values(err.constraints ?? {}).join(', '))
        .join('; ')}`,
    );
  }
  return validated;
}
