import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GeneratePlanDto {
  @IsInt()
  @Min(1)
  @Max(60)
  days: number; // e.g. 15

  @IsOptional()
  @IsString()
  subject?: string; // Optional focus subject
}
