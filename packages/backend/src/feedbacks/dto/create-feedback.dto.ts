import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator"

const clientPlatforms = ["ios", "android", "windows", "mac", "web"] as const

type ClientPlatform = (typeof clientPlatforms)[number]

export class CreateFeedbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  user_id?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number

  @IsString()
  @MaxLength(4096)
  content!: string

  @IsOptional()
  @IsIn(clientPlatforms)
  platform?: ClientPlatform

  @IsOptional()
  @IsObject()
  custom_data?: Record<string, unknown>
}
