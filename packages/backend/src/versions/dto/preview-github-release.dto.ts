import { IsOptional, IsString, MaxLength } from "class-validator"

export class PreviewGithubReleaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  tag?: string
}
