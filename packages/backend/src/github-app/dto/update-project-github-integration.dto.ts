import { Type } from "class-transformer"
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator"

import { FEEDBACK_TEMPLATE_SOURCES, type FeedbackTemplateSource } from "../feedback-issue-template"
import { GITHUB_AUTHOR_ASSOCIATIONS } from "../types"

/** 单条命令定义。命令名限小写字母数字连字符，避免解析歧义。 */
export class GithubCommandDefinitionDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,31}$/, {
    message: "command name must be lowercase letters, digits and hyphens",
  })
  name!: string

  @IsString()
  @MaxLength(128)
  workflow!: string

  @IsString()
  @MaxLength(128)
  ref!: string

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/, { message: "input must be a valid input name" })
  input?: string
}

/** 部分更新：只动传了的字段。repo 传空字符串表示清除。 */
export class UpdateProjectGithubIntegrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(140)
  @Matches(/^$|^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, {
    message: "repo_full_name must look like owner/repo",
  })
  repo_full_name?: string

  @IsOptional()
  @IsBoolean()
  feedback_issue_enabled?: boolean

  @IsOptional()
  @IsIn(FEEDBACK_TEMPLATE_SOURCES)
  feedback_issue_template_source?: FeedbackTemplateSource

  /** 仓库内的模板文件路径。禁 `..` 与前导 `/`，避免拼出仓库外的路径。 */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Matches(/^$|^(?!\/)(?!.*\.\.)[\w./-]+$/, {
    message: "feedback_issue_template_repo_path must be a repository-relative file path",
  })
  feedback_issue_template_repo_path?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  feedback_issue_template_repo_ref?: string

  @IsOptional()
  @IsString()
  @MaxLength(256)
  feedback_issue_title_template?: string

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  feedback_issue_body_template?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  feedback_issue_labels?: string[]

  @IsOptional()
  @IsBoolean()
  comment_commands_enabled?: boolean

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(GITHUB_AUTHOR_ASSOCIATIONS.length)
  @IsIn(GITHUB_AUTHOR_ASSOCIATIONS, { each: true })
  command_allowed_associations?: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  command_allowed_users?: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => GithubCommandDefinitionDto)
  commands?: GithubCommandDefinitionDto[]
}
