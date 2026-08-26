"use client"

import * as React from "react"
import {
  AlertTriangle,
  Github,
  KeyRound,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { getErrorMessage } from "@/lib/error-utils"
import { LoadingLine } from "@/components/common/skeleton"
import { useUnsavedChangesGuard } from "@/components/common/unsaved-changes-guard"
import { FeaturePanel } from "@/components/common/feature-panel"
import { IssueTemplateEditor } from "@/components/github/issue-template-editor"
import {
  FIELD_CLASS,
  LabeledField,
  SegmentedButton,
  SegmentedGroup,
  StatusBadge,
  TextField,
} from "@/components/common/settings-fields"
import {
  EMPTY_SECRET_STATE,
  hasSecretChange,
  type WebhookSecretState,
} from "@/components/github/webhook-secret-field"
import { MarkdownContent } from "@/components/markdown/markdown-content"
import {
  GithubWebhookSettings,
  MIN_SECRET_LENGTH,
} from "@/components/projects/github-webhook-settings"
import {
  clearGithubWebhookSecret,
  getGithubWebhookSettings,
  setGithubWebhookSecret,
  type GithubWebhookSettings as WebhookSettings,
} from "@/lib/projects-api"
import {
  getGithubAppConfig,
  getGithubIntegrationRepoTemplate,
  getProjectGithubIntegration,
  updateProjectGithubIntegration,
  type FeedbackIssueRepoTemplatePreview,
  type FeedbackIssueTemplateSource,
  type GithubAppConfigView,
  type GithubCommandDefinition,
  type ProjectGithubIntegrationView,
} from "@/lib/github-app-api"

/** GitHub author_association 的可选项与中文说明，来源限制配置用。 */
const ASSOCIATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "OWNER", label: "OWNER（仓库所有者）" },
  { value: "MEMBER", label: "MEMBER（组织成员）" },
  { value: "COLLABORATOR", label: "COLLABORATOR（协作者）" },
  { value: "CONTRIBUTOR", label: "CONTRIBUTOR（贡献过代码）" },
  { value: "NONE", label: "NONE（任何人，慎用）" },
]

const TEMPLATE_SOURCE_OPTIONS: Array<{
  value: FeedbackIssueTemplateSource
  label: string
  hint: string
}> = [
  {
    value: "inherit",
    label: "跟随实例",
    hint: "使用「网站设置 → GitHub APP 设置」里的实例级模板。",
  },
  { value: "custom", label: "本项目自定义", hint: "只对本项目生效，直接在下面编辑。" },
  {
    value: "repo",
    label: "从仓库文件读取",
    hint: "把模板放进目标仓库并在这里填路径，改完仓库里的文件即自动生效（约 5 分钟内）。",
  },
]

type TabKey = "app" | "webhook"

type CommandRow = GithubCommandDefinition

/**
 * 从项目自己的仓库地址推出 owner/repo，作为目标仓库的默认值。
 * 认不出来（非 GitHub 或写法特殊）就留空，让人自己填，不猜。
 */
function deriveRepoFullName(repoUrl: string | null | undefined): string {
  if (!repoUrl?.trim()) {
    return ""
  }
  const matched = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(repoUrl.trim())
  return matched ? `${matched[1]}/${matched[2]}` : ""
}

export function GithubIntegrationDialog({
  open,
  onOpenChange,
  token,
  projectKey,
  projectRepoUrl,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  projectKey: string | null
  /** 项目自身的仓库地址，用来预填目标仓库。 */
  projectRepoUrl?: string | null
}) {
  const [tab, setTab] = React.useState<TabKey>("app")
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [appConfig, setAppConfig] = React.useState<GithubAppConfigView | null>(null)
  const [view, setView] = React.useState<ProjectGithubIntegrationView | null>(null)

  const [repo, setRepo] = React.useState("")
  const [feedbackEnabled, setFeedbackEnabled] = React.useState(false)
  const [templateSource, setTemplateSource] = React.useState<FeedbackIssueTemplateSource>("inherit")
  const [templateRepoPath, setTemplateRepoPath] = React.useState("")
  const [templateRepoRef, setTemplateRepoRef] = React.useState("")
  const [titleTemplate, setTitleTemplate] = React.useState("")
  const [bodyTemplate, setBodyTemplate] = React.useState("")
  const [labels, setLabels] = React.useState("")
  const [commandsEnabled, setCommandsEnabled] = React.useState(false)
  const [associations, setAssociations] = React.useState<string[]>([])
  const [allowedUsers, setAllowedUsers] = React.useState("")
  const [commands, setCommands] = React.useState<CommandRow[]>([])
  const [repoTemplate, setRepoTemplate] = React.useState<FeedbackIssueRepoTemplatePreview | null>(
    null,
  )
  const [repoTemplateLoading, setRepoTemplateLoading] = React.useState(false)
  const [webhook, setWebhook] = React.useState<WebhookSettings | null>(null)
  const [webhookSecret, setWebhookSecret] = React.useState<WebhookSecretState>(EMPTY_SECRET_STATE)

  // 这个弹窗是异步填表、且保存成功后不关闭，所以基线跟着 view 走：applyView 每次
  // 换新引用（首次加载完成、每次保存成功）都正好是该把当前值重设为基线的时刻。
  const handleOpenChange = useUnsavedChangesGuard({
    open,
    onOpenChange,
    value: {
      repo,
      feedbackEnabled,
      templateSource,
      templateRepoPath,
      templateRepoRef,
      titleTemplate,
      bodyTemplate,
      labels,
      commandsEnabled,
      associations,
      allowedUsers,
      commands,
      webhookSecret,
    },
    baselineKey: view,
  })

  const applyView = React.useCallback(
    (next: ProjectGithubIntegrationView, config: GithubAppConfigView) => {
      setView(next)
      // 还没配过目标仓库时，用项目自己的仓库地址预填 —— 绝大多数情况就是同一个。
      setRepo(next.repo_full_name ?? deriveRepoFullName(projectRepoUrl))
      setFeedbackEnabled(next.feedback_issue_enabled)
      setTemplateSource(next.feedback_issue_template_source)
      setTemplateRepoPath(next.feedback_issue_template_repo_path ?? "")
      setTemplateRepoRef(next.feedback_issue_template_repo_ref ?? "")
      // 项目没写过自己的模板时，从实例当前生效的那份铺进来当起点。
      setTitleTemplate(
        next.feedback_issue_title_template ??
          (config.feedback_issue_custom_template
            ? (config.feedback_issue_title_template ?? config.builtin_feedback_issue_title_template)
            : config.builtin_feedback_issue_title_template),
      )
      setBodyTemplate(
        next.feedback_issue_body_template ??
          (config.feedback_issue_custom_template
            ? (config.feedback_issue_body_template ?? config.builtin_feedback_issue_body_template)
            : config.builtin_feedback_issue_body_template),
      )
      setLabels(next.feedback_issue_labels.join(", "))
      setCommandsEnabled(next.comment_commands_enabled)
      setAssociations(next.command_allowed_associations)
      setAllowedUsers(next.command_allowed_users.join(", "))
      setCommands(next.commands)
    },
    [projectRepoUrl],
  )

  React.useEffect(() => {
    if (!open || !token || !projectKey) {
      return
    }

    const controller = new AbortController()
    setTab("app")
    setLoading(true)
    setError(null)
    setRepoTemplate(null)
    setWebhookSecret(EMPTY_SECRET_STATE)

    Promise.all([
      getProjectGithubIntegration(token, projectKey, controller.signal),
      getGithubAppConfig(token, controller.signal),
      getGithubWebhookSettings(token, projectKey, controller.signal),
    ])
      .then(([integration, config, webhookSettings]) => {
        setAppConfig(config)
        applyView(integration, config)
        setWebhook(webhookSettings)
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(loadError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [open, token, projectKey, applyView])

  function toggleAssociation(value: string, checked: boolean) {
    setAssociations((prev) =>
      checked ? [...new Set([...prev, value])] : prev.filter((item) => item !== value),
    )
  }

  function updateCommand(index: number, patch: Partial<CommandRow>) {
    setCommands((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  async function loadRepoTemplate(refresh: boolean) {
    if (!token || !projectKey) {
      return
    }
    setRepoTemplateLoading(true)
    try {
      setRepoTemplate(await getGithubIntegrationRepoTemplate(token, projectKey, { refresh }))
    } catch (previewError) {
      toast.error(getErrorMessage(previewError))
    } finally {
      setRepoTemplateLoading(false)
    }
  }

  async function handleSave() {
    if (!token || !projectKey) {
      return
    }

    const invalidCommand = commands.find(
      (command) => !command.name.trim() || !command.workflow.trim() || !command.ref.trim(),
    )
    if (invalidCommand) {
      toast.error("命令的名称、workflow 与 ref 均为必填。")
      return
    }
    if (feedbackEnabled && templateSource === "repo" && !templateRepoPath.trim()) {
      toast.error("模板来源选了「从仓库文件读取」，请填写模板文件路径。")
      return
    }
    const draftSecret = webhookSecret.draft.trim()
    if (draftSecret && draftSecret.length < MIN_SECRET_LENGTH) {
      toast.error(`Webhook secret 至少需要 ${MIN_SECRET_LENGTH} 个字符。`)
      setTab("webhook")
      return
    }

    setSaving(true)
    try {
      const next = await updateProjectGithubIntegration(token, projectKey, {
        repo_full_name: repo.trim(),
        feedback_issue_enabled: feedbackEnabled,
        feedback_issue_template_source: templateSource,
        feedback_issue_template_repo_path: templateRepoPath.trim(),
        feedback_issue_template_repo_ref: templateRepoRef.trim(),
        // 只有本项目自定义时才回传模板，避免把编辑器里预填的实例模板固化成项目模板。
        ...(templateSource === "custom"
          ? {
              feedback_issue_title_template: titleTemplate,
              feedback_issue_body_template: bodyTemplate,
            }
          : {}),
        feedback_issue_labels: labels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
        comment_commands_enabled: commandsEnabled,
        command_allowed_associations: associations,
        command_allowed_users: allowedUsers
          .split(",")
          .map((user) => user.trim())
          .filter(Boolean),
        commands: commands.map((command) => ({
          name: command.name.trim(),
          workflow: command.workflow.trim(),
          ref: command.ref.trim(),
          ...(command.input?.trim() ? { input: command.input.trim() } : {}),
        })),
      })
      // 两个选项卡由同一个按钮保存：secret 没动过就不发请求，避免每次保存都重写它。
      if (hasSecretChange(webhookSecret)) {
        setWebhook(
          draftSecret
            ? await setGithubWebhookSecret(token, projectKey, draftSecret)
            : await clearGithubWebhookSecret(token, projectKey),
        )
        setWebhookSecret(EMPTY_SECRET_STATE)
      }
      if (appConfig) {
        applyView(next, appConfig)
      }
      toast.success("GitHub 集成配置已保存。")
    } catch (saveError) {
      toast.error(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const featureEnabledAtInstance = (feature: "feedback_issue" | "comment_commands") =>
    Boolean(appConfig?.configured && appConfig.enabled_features.includes(feature))

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="size-4" />
            GitHub 集成
          </DialogTitle>
          <DialogDescription>配置GitHub相关专属功能</DialogDescription>
        </DialogHeader>

        <DialogBody>
          {loading ? <LoadingLine>正在读取集成配置...</LoadingLine> : null}

          {error ? <p className="text-sm text-rose-500">{error}</p> : null}

          {!loading && view ? (
            <div className="space-y-4">
              <SegmentedGroup role="tablist" className="flex w-full text-sm">
                <SegmentedButton
                  role="tab"
                  grow
                  active={tab === "app"}
                  onClick={() => setTab("app")}
                  icon={<Github className="size-4" />}
                  label="GitHub App"
                />
                <SegmentedButton
                  role="tab"
                  grow
                  active={tab === "webhook"}
                  onClick={() => setTab("webhook")}
                  icon={<KeyRound className="size-4" />}
                  label="Release Webhook"
                />
              </SegmentedGroup>

              {tab === "app" ? (
                <div className="space-y-4">
                  {appConfig && !appConfig.configured ? (
                    <p className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>
                        实例尚未完成 GitHub App 配置，请先到
                        <Link href="/admin/settings/github-app" className="mx-1 underline">
                          GitHub APP 设置
                        </Link>
                        填写凭据并启用功能。
                      </span>
                    </p>
                  ) : null}

                  <TextField
                    label="目标仓库"
                    value={repo}
                    onChange={setRepo}
                    placeholder="例如：acme/app"
                    maxLength={140}
                  />

                  {/* ── 反馈转发 Issue ── */}
                  <FeaturePanel
                    title="允许把反馈转发为 GitHub Issue"
                    description="开启后客户端可以提交「同时提交到 GitHub Issue」的选项，启用该选项将自动将该反馈转化为Github Issue。"
                    disabledHint="该功能未在实例级启用，无法打开。请先到「网站设置 → GitHub APP 设置」启用。"
                    checked={feedbackEnabled}
                    disabled={!featureEnabledAtInstance("feedback_issue")}
                    onCheckedChange={setFeedbackEnabled}
                    badge={
                      view.feedback_issue_enabled && !view.feedback_issue_active ? (
                        <InactiveBadge />
                      ) : null
                    }
                  >
                    <div className="space-y-1.5 text-sm">
                      <span className="text-slate-700 dark:text-slate-300">Issue 模板来源</span>
                      <div className="grid gap-1.5 sm:grid-cols-3">
                        {TEMPLATE_SOURCE_OPTIONS.map((option) => (
                          <label
                            key={option.value}
                            className={`cursor-pointer rounded-lg border p-2.5 text-xs ${
                              templateSource === option.value
                                ? "border-sky-500/60 bg-sky-500/10"
                                : "border-slate-900/15 dark:border-white/15"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 font-medium">
                              <input
                                type="radio"
                                name="feedback-template-source"
                                checked={templateSource === option.value}
                                onChange={() => setTemplateSource(option.value)}
                                className="size-3.5"
                              />
                              {option.label}
                            </span>
                            <span className="mt-1 block text-slate-600 dark:text-slate-400">
                              {option.hint}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {templateSource === "custom" && appConfig ? (
                      <IssueTemplateEditor
                        titleTemplate={titleTemplate}
                        bodyTemplate={bodyTemplate}
                        onTitleChange={setTitleTemplate}
                        onBodyChange={setBodyTemplate}
                        variables={appConfig.feedback_issue_template_variables}
                      />
                    ) : null}

                    {templateSource === "repo" ? (
                      <RepoTemplateFields
                        path={templateRepoPath}
                        onPathChange={setTemplateRepoPath}
                        gitRef={templateRepoRef}
                        onRefChange={setTemplateRepoRef}
                        preview={repoTemplate}
                        loading={repoTemplateLoading}
                        onPreview={() => void loadRepoTemplate(true)}
                      />
                    ) : null}

                    <TextField
                      label="Issue 标签（逗号分隔，可留空）"
                      value={labels}
                      onChange={setLabels}
                      placeholder="feedback, triage"
                      hint={
                        templateSource === "repo"
                          ? "仓库模板在 front matter 里声明了 labels 时，以模板里的为准。"
                          : undefined
                      }
                    />
                  </FeaturePanel>

                  {/* ── 评论命令 ── */}
                  <FeaturePanel
                    title="评论命令触发工作流"
                    description="在目标仓库的 Issue / PR 评论首行输入 /verhub-<命令> <参数> 触发下面配置的 workflow_dispatch，参数作为 workflow input 传入。"
                    disabledHint="该功能未在实例级启用，无法打开。请先到「网站设置 → GitHub APP 设置」启用。"
                    checked={commandsEnabled}
                    disabled={!featureEnabledAtInstance("comment_commands")}
                    onCheckedChange={setCommandsEnabled}
                    badge={
                      view.comment_commands_enabled && !view.comment_commands_active ? (
                        <InactiveBadge />
                      ) : null
                    }
                  >
                    <LabeledField
                      as="div"
                      label="允许触发的来源（评论者与仓库的关联，author_association）"
                    >
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {ASSOCIATION_OPTIONS.map((option) => (
                          <label
                            key={option.value}
                            className="inline-flex items-center gap-1.5 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={associations.includes(option.value)}
                              onChange={(event) =>
                                toggleAssociation(option.value, event.target.checked)
                              }
                              className="size-3.5"
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </LabeledField>

                    <TextField
                      label="额外放行的 GitHub 用户（逗号分隔，与上面的关联取并集）"
                      value={allowedUsers}
                      onChange={setAllowedUsers}
                      placeholder="alice, bob"
                    />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-700 dark:text-slate-300">命令定义</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setCommands((prev) => [
                              ...prev,
                              { name: "", workflow: "", ref: "main" },
                            ])
                          }
                        >
                          <Plus className="size-3.5" />
                          添加命令
                        </Button>
                      </div>

                      {commands.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          尚未定义命令。示例：命令名 release + workflow release.yml + 参数名
                          version， 评论 <code>/verhub-release 3.2.0</code> 即以 version=3.2.0 触发
                          release.yml。
                        </p>
                      ) : null}

                      {commands.map((command, index) => (
                        <div
                          key={index}
                          className="grid gap-2 rounded-lg border border-slate-900/10 bg-white/60 p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] dark:border-white/10 dark:bg-white/5"
                        >
                          <label className="space-y-0.5 text-xs">
                            <span className="text-slate-500 dark:text-slate-400">
                              命令名（/verhub-*）
                            </span>
                            <input
                              type="text"
                              value={command.name}
                              onChange={(event) =>
                                updateCommand(index, { name: event.target.value })
                              }
                              placeholder="release"
                              className={FIELD_CLASS}
                            />
                          </label>
                          <label className="space-y-0.5 text-xs">
                            <span className="text-slate-500 dark:text-slate-400">
                              Workflow 文件
                            </span>
                            <input
                              type="text"
                              value={command.workflow}
                              onChange={(event) =>
                                updateCommand(index, { workflow: event.target.value })
                              }
                              placeholder="release.yml"
                              className={FIELD_CLASS}
                            />
                          </label>
                          <label className="space-y-0.5 text-xs">
                            <span className="text-slate-500 dark:text-slate-400">目标 ref</span>
                            <input
                              type="text"
                              value={command.ref}
                              onChange={(event) =>
                                updateCommand(index, { ref: event.target.value })
                              }
                              placeholder="main"
                              className={FIELD_CLASS}
                            />
                          </label>
                          <label className="space-y-0.5 text-xs">
                            <span className="text-slate-500 dark:text-slate-400">
                              参数名（可选）
                            </span>
                            <input
                              type="text"
                              value={command.input ?? ""}
                              onChange={(event) =>
                                updateCommand(index, { input: event.target.value })
                              }
                              placeholder="args"
                              className={FIELD_CLASS}
                            />
                          </label>
                          <div className="flex items-end">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              title="删除命令"
                              aria-label="删除命令"
                              onClick={() =>
                                setCommands((prev) => prev.filter((_, i) => i !== index))
                              }
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </FeaturePanel>
                </div>
              ) : (
                <GithubWebhookSettings
                  settings={webhook}
                  secret={webhookSecret}
                  onSecretChange={setWebhookSecret}
                  embedded
                />
              )}
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            关闭
          </Button>
          {/* 一个按钮同时落两个选项卡的改动，切来切去也不会漏保存。 */}
          <Button
            type="button"
            disabled={saving || loading || !projectKey}
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存集成配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RepoTemplateFields({
  path,
  onPathChange,
  gitRef,
  onRefChange,
  preview,
  loading,
  onPreview,
}: {
  path: string
  onPathChange: (value: string) => void
  gitRef: string
  onRefChange: (value: string) => void
  preview: FeedbackIssueRepoTemplatePreview | null
  loading: boolean
  onPreview: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">模板文件路径（仓库内相对路径）</span>
          <input
            type="text"
            value={path}
            onChange={(event) => onPathChange(event.target.value)}
            placeholder=".github/verhub-feedback-issue.md"
            className={FIELD_CLASS}
            maxLength={256}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-700 dark:text-slate-300">分支 / 标签（留空取默认分支）</span>
          <input
            type="text"
            value={gitRef}
            onChange={(event) => onRefChange(event.target.value)}
            placeholder="main"
            className={FIELD_CLASS}
            maxLength={128}
          />
        </label>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        文件可用 <code>---</code> front matter 声明 <code>title</code> 与 <code>labels</code>
        ，其余内容作为正文；没有 front matter 时整个文件即正文。需要 GitHub App 的 Contents:
        Read-only 权限。保存后先点一次预览确认能读到。
      </p>

      <Button type="button" size="sm" variant="outline" disabled={loading} onClick={onPreview}>
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCcw className="size-3.5" />
        )}
        从仓库拉取并预览
      </Button>

      {preview?.error ? (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-300">
          {preview.error}
        </p>
      ) : null}

      {preview && !preview.error ? (
        <div className="space-y-2 rounded-lg border border-slate-900/15 bg-white/70 p-3 dark:border-white/15 dark:bg-white/5">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            标题模板：<code>{preview.title_template}</code>
            {preview.labels.length > 0 ? ` / 标签：${preview.labels.join(", ")}` : null}
          </p>
          <MarkdownContent className="text-sm">{preview.body_template ?? ""}</MarkdownContent>
        </div>
      ) : null}
    </div>
  )
}

function InactiveBadge() {
  return <StatusBadge tone="warn">未生效：实例配置不完整</StatusBadge>
}
