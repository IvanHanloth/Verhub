import { IsString, IsUrl, MaxLength } from "class-validator"

export class PreviewGithubRepoDto {
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(512)
  repo_url!: string
}
