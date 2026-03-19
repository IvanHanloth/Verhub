import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator"

export class UploadLogDto {
  @IsInt()
  @Min(0)
  @Max(3)
  level!: number

  @IsString()
  @MaxLength(4096)
  content!: string

  @IsOptional()
  @IsObject()
  device_info?: Record<string, unknown>

  @IsOptional()
  @IsObject()
  custom_data?: Record<string, unknown>
}
