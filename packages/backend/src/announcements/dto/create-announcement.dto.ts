import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from "class-validator"

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
  @IsString()
  @MaxLength(64)
  author?: string

  @IsOptional()
  @IsInt()
  published_at?: number
}
