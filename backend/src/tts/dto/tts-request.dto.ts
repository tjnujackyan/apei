import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class TtsRequestDto {
  @IsString()
  @Length(1, 2000)
  text: string;

  @IsOptional()
  @IsString()
  voice?: string;

  @IsOptional()
  @IsString()
  referenceText?: string;

  @IsOptional()
  @IsString()
  emotion?: string;

  @IsOptional()
  @IsInt()
  @Min(8)
  sampleRate?: number;
}
