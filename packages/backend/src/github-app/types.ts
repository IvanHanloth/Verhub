/** GitHub App 集成模块的共享类型与常量。 */

import type { FeedbackTemplateSource } from "./feedback-issue-template"

/**
 * 可启用的 GitHub App 功能。
 *
 * 实例级 enabledFeatures 是总闸：不在这里的功能，项目级开关拒绝打开、
 * 运行时也不执行 —— 这样管理员在「设置」页收掉一个功能后立刻全局生效。
 */
export const GITHUB_APP_FEATURES = ["feedback_issue", "comment_commands"] as const

export type GithubAppFeature = (typeof GITHUB_APP_FEATURES)[number]

/** GitHub author_association 的合法取值，用于校验 comment 命令的来源限制。 */
export const GITHUB_AUTHOR_ASSOCIATIONS = [
  "OWNER",
  "MEMBER",
  "COLLABORATOR",
  "CONTRIBUTOR",
  "FIRST_TIME_CONTRIBUTOR",
  "FIRST_TIMER",
  "MANNEQUIN",
  "NONE",
] as const

/** 管理端可见的实例级配置视图。私钥永不回读，只给指纹。 */
export type GithubAppConfigView = {
  /** App ID 与私钥都已配置才算 configured，功能才可能生效。 */
  configured: boolean
  app_id: string | null
  has_private_key: boolean
  private_key_fingerprint: string | null
  private_key_updated_at: number | null
  has_webhook_secret: boolean
  /** 已存 secret 的末 6 位，用于区分是否换过 secret。 */
  webhook_secret_hint: string | null
  /** 已存 secret 的字符数，供管理端渲染与真实长度一致的星号掩码。 */
  webhook_secret_length: number | null
  webhook_secret_updated_at: number | null
  /** App 事件（issue_comment 等）的投递路径，配置到 GitHub App 的 Webhook URL。 */
  webhook_payload_path: string
  enabled_features: GithubAppFeature[]
  /** 关掉时下面两个模板一律被忽略，实例缺省即内置模板。 */
  feedback_issue_custom_template: boolean
  feedback_issue_title_template: string | null
  feedback_issue_body_template: string | null
  /** 内置模板原文，供管理端做「自定义模板」输入框的初值与对照预览。 */
  builtin_feedback_issue_title_template: string
  builtin_feedback_issue_body_template: string
  /** 模板可用变量清单，UI 直接渲染，避免前端抄一份。 */
  feedback_issue_template_variables: string[]
  updated_at: number | null
}

/** 项目级命令定义。/verhub-<name> <args> → workflow_dispatch。 */
export type GithubCommandDefinition = {
  /** 命令名（不含 /verhub- 前缀），如 "release"。 */
  name: string
  /** workflow 文件名或 ID，如 "release.yml"。 */
  workflow: string
  /** dispatch 的目标 ref，默认仓库默认分支需显式填写，如 "main"。 */
  ref: string
  /** 参数写入 inputs 的键名，缺省 "args"。 */
  input?: string
}

/** 管理端可见的项目级集成视图。 */
export type ProjectGithubIntegrationView = {
  project_key: string
  repo_full_name: string | null
  /** 只表示「允许转发」；是否转发由提交者逐条选择。 */
  feedback_issue_enabled: boolean
  /** 综合实例配置得出的实际生效状态，供 UI 与调用方直接判断。 */
  feedback_issue_active: boolean
  feedback_issue_template_source: FeedbackTemplateSource
  feedback_issue_template_repo_path: string | null
  feedback_issue_template_repo_ref: string | null
  feedback_issue_title_template: string | null
  feedback_issue_body_template: string | null
  feedback_issue_labels: string[]
  comment_commands_enabled: boolean
  comment_commands_active: boolean
  command_allowed_associations: string[]
  command_allowed_users: string[]
  commands: GithubCommandDefinition[]
  updated_at: number | null
}

/** 仓库模板文件的拉取结果。拉不到时给 error，让管理端能直接看到原因。 */
export type FeedbackIssueRepoTemplatePreview = {
  path: string
  ref: string | null
  fetched_at: number | null
  title_template: string | null
  body_template: string | null
  labels: string[]
  error: string | null
}

/** 公开端：客户端据此决定要不要给用户显示「转发到 GitHub」这个选项。 */
export type PublicFeedbackOptions = {
  project_key: string
  /** 本项目当前是否接受转发请求（实例功能开 + 项目允许 + 凭据齐 + 有仓库）。 */
  github_forward_available: boolean
  /** 选择转发时联系方式是否必填。转发不可用时恒为 false。 */
  contact_required_for_forward: boolean
}

/** App 级 webhook 的处理结果，会显示在 GitHub 的 delivery 日志里。 */
export type GithubAppWebhookResult = {
  status: "dispatched" | "ignored" | "pong"
  reason?: string
  event?: string
  command?: string
  project_key?: string
  workflow?: string
}
