import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator"

const clientPlatforms = ["ios", "android", "windows", "mac", "web"] as const

type ClientPlatform = (typeof clientPlatforms)[number]

export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(128)
  title!: string

  @IsString()
  @MaxLength(4096)
  content!: string

  @IsOptional()
  @IsBoolean()
  is_pinned?: boolean

  @IsOptional()
  @IsBoolean()
  is_hidden?: boolean

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsIn(clientPlatforms, { each: true })
  platforms?: ClientPlatform[]

  @IsOptional()
  @IsString()
  @MaxLength(64)
  author?: string

  @IsOptional()
  @IsInt()
  published_at?: number
}
