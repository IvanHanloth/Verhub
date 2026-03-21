import { IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from "class-validator"

export class CreateProjectDto {
  @IsString()
  @MaxLength(64)
  project_key!: string

  @IsString()
  @MaxLength(128)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  repo_url?: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  author?: string

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  author_homepage_url?: string

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1024)
  icon_url?: string

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  website_url?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  published_at?: number
}
