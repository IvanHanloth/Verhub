import { requestJson } from "@/lib/api-client"

export type GithubAppFeature = "feedback_issue" | "comment_commands"

export type GithubAppConfigView = {
  configured: boolean
  app_id: string | null
  has_private_key: boolean
  private_key_fingerprint: string | null
  private_key_updated_at: number | null
  has_webhook_secret: boolean
  /** 末 6 位提示，完整 secret 只在设置时返回一次。 */
  webhook_secret_hint: string | null
  /** 已存 secret 的字符数，用于把掩码铺到真实长度。 */
  webhook_secret_length: number | null
  webhook_secret_updated_at: number | null
  webhook_payload_path: string
  enabled_features: GithubAppFeature[]
  /** 关闭时忽略下面两个模板字段，实例缺省即内置模板。 */
  feedback_issue_custom_template: boolean
  feedback_issue_title_template: string | null
  feedback_issue_body_template: string | null
  /** 内置模板原文，用作「自定义模板」编辑器的初值。内置正文不含评分。 */
  builtin_feedback_issue_title_template: string
  builtin_feedback_issue_body_template: string
  feedback_issue_template_variables: string[]
  updated_at: number | null
}

export type UpdateGithubAppConfigInput = {
  app_id?: string
  /** 私钥 PEM 原文，只写不读；空字符串表示清除。 */
  private_key?: string
  webhook_secret?: string
  enabled_features?: GithubAppFeature[]
  feedback_issue_custom_template?: boolean
  feedback_issue_title_template?: string
  feedback_issue_body_template?: string
}

/** 项目模板来源：跟随实例 / 项目自定义 / 读仓库文件。 */
export type FeedbackIssueTemplateSource = "inherit" | "custom" | "repo"

/** 仓库模板文件的拉取结果。拉不到时 error 给出原因。 */
export type FeedbackIssueRepoTemplatePreview = {
  path: string
  ref: string | null
  fetched_at: number | null
  title_template: string | null
  body_template: string | null
  labels: string[]
  error: string | null
}

export type GithubCommandDefinition = {
  name: string
  workflow: string
  ref: string
  input?: string
}

export type ProjectGithubIntegrationView = {
  project_key: string
  repo_full_name: string | null
  /** 只表示「允许转发」；是否转发由提交者逐条选择。 */
  feedback_issue_enabled: boolean
  feedback_issue_active: boolean
  feedback_issue_template_source: FeedbackIssueTemplateSource
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

export type UpdateProjectGithubIntegrationInput = {
  repo_full_name?: string
  feedback_issue_enabled?: boolean
  feedback_issue_template_source?: FeedbackIssueTemplateSource
  feedback_issue_template_repo_path?: string
  feedback_issue_template_repo_ref?: string
  feedback_issue_title_template?: string
  feedback_issue_body_template?: string
  feedback_issue_labels?: string[]
  comment_commands_enabled?: boolean
  command_allowed_associations?: string[]
  command_allowed_users?: string[]
  commands?: GithubCommandDefinition[]
}

export async function getGithubAppConfig(
  token: string,
  signal?: AbortSignal,
): Promise<GithubAppConfigView> {
  return requestJson<GithubAppConfigView>("/admin/github-app", { token, signal })
}

export async function updateGithubAppConfig(
  token: string,
  input: UpdateGithubAppConfigInput,
): Promise<GithubAppConfigView> {
  return requestJson<GithubAppConfigView>("/admin/github-app", {
    method: "PUT",
    token,
    body: input,
  })
}

export async function clearGithubAppConfig(token: string): Promise<GithubAppConfigView> {
  return requestJson<GithubAppConfigView>("/admin/github-app", { method: "DELETE", token })
}

export async function getProjectGithubIntegration(
  token: string,
  projectKey: string,
  signal?: AbortSignal,
): Promise<ProjectGithubIntegrationView> {
  return requestJson<ProjectGithubIntegrationView>(
    `/admin/projects/${projectKey}/github-integration`,
    { token, signal },
  )
}

export async function updateProjectGithubIntegration(
  token: string,
  projectKey: string,
  input: UpdateProjectGithubIntegrationInput,
): Promise<ProjectGithubIntegrationView> {
  return requestJson<ProjectGithubIntegrationView>(
    `/admin/projects/${projectKey}/github-integration`,
    { method: "PUT", token, body: input },
  )
}

/** 按项目已保存的路径拉一次仓库模板。失败不抛异常，原因在 error 字段里。 */
export async function getGithubIntegrationRepoTemplate(
  token: string,
  projectKey: string,
  options: { refresh?: boolean } = {},
): Promise<FeedbackIssueRepoTemplatePreview> {
  const query = options.refresh ? "?refresh=true" : ""
  return requestJson<FeedbackIssueRepoTemplatePreview>(
    `/admin/projects/${projectKey}/github-integration/repo-template${query}`,
    { token },
  )
}
