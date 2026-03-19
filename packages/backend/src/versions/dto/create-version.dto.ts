import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator"

const clientPlatforms = ["ios", "android", "windows", "mac", "web"] as const

type ClientPlatform = (typeof clientPlatforms)[number]

export class CreateVersionDto {
  @IsString()
  @MaxLength(64)
  version!: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  content?: string

  @IsString()
  @MaxLength(2048)
  download_url!: string

  @IsOptional()
  @IsBoolean()
  forced?: boolean

  @IsOptional()
  @IsIn(clientPlatforms)
  platform?: ClientPlatform

  @IsOptional()
  @IsObject()
  custom_data?: Record<string, unknown>
}
