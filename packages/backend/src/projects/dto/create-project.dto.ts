import { IsOptional, IsString, MaxLength } from "class-validator"

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
}
