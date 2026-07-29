import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import { ApiError } from "@/lib/api-client"
import {
  createProject,
  getGithubWebhookSettings,
  listProjects,
  previewProjectFromGithubRepo,
  updateProject,
} from "@/lib/projects-api"

import { ProjectsDashboard } from "./projects-dashboard"

vi.mock("@/lib/projects-api", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  previewProjectFromGithubRepo: vi.fn(),
  // 编辑弹窗里嵌了 webhook 配置面板，打开弹窗就会拉一次配置。
  getGithubWebhookSettings: vi.fn().mockResolvedValue({
    enabled: false,
    payload_path: "/api/v1/webhooks/github/project-a",
    content_type: "application/json",
    secret_hint: null,
    secret_length: null,
    secret_updated_at: null,
  }),
  regenerateGithubWebhookSecret: vi.fn(),
  setGithubWebhookSecret: vi.fn(),
  clearGithubWebhookSecret: vi.fn(),
  // 编辑弹窗还嵌了别名面板，打开弹窗会拉一次别名列表。
  listProjectAliases: vi.fn().mockResolvedValue({ data: [] }),
  deleteProjectAlias: vi.fn(),
}))

vi.mock("@/lib/github-app-api", () => ({
  // GitHub 集成弹窗打开即拉项目集成配置与实例级 App 配置。
  getProjectGithubIntegration: vi.fn().mockResolvedValue({
    project_key: "verhub",
    repo_full_name: null,
    feedback_issue_enabled: false,
    feedback_issue_active: false,
    feedback_issue_template_source: "inherit",
    feedback_issue_template_repo_path: null,
    feedback_issue_template_repo_ref: null,
    feedback_issue_title_template: null,
    feedback_issue_body_template: null,
    feedback_issue_labels: [],
    comment_commands_enabled: false,
    comment_commands_active: false,
    command_allowed_associations: ["OWNER", "MEMBER", "COLLABORATOR"],
    command_allowed_users: [],
    commands: [],
    updated_at: null,
  }),
  updateProjectGithubIntegration: vi.fn(),
  getGithubAppConfig: vi.fn().mockResolvedValue({
    configured: false,
    app_id: null,
    has_private_key: false,
    private_key_fingerprint: null,
    private_key_updated_at: null,
    has_webhook_secret: false,
    webhook_secret_hint: null,
    webhook_secret_length: null,
    webhook_secret_updated_at: null,
    webhook_payload_path: "/api/v1/webhooks/github-app",
    enabled_features: [],
    feedback_issue_custom_template: false,
    feedback_issue_title_template: null,
    feedback_issue_body_template: null,
    builtin_feedback_issue_title_template: "[用户反馈] {{content_head}}",
    builtin_feedback_issue_body_template: "## 反馈内容",
    feedback_issue_template_variables: ["content", "contact"],
    updated_at: null,
  }),
  getGithubIntegrationRepoTemplate: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockedListProjects = vi.mocked(listProjects)
const mockedPreviewProjectFromGithubRepo = vi.mocked(previewProjectFromGithubRepo)
const mockedCreateProject = vi.mocked(createProject)
const mockedUpdateProject = vi.mocked(updateProject)
const mockedGetGithubWebhookSettings = vi.mocked(getGithubWebhookSettings)
const mockedToastError = vi.mocked(toast.error)

const WEBHOOK_SETTINGS = {
  enabled: false,
  payload_path: "/api/v1/webhooks/github/verhub",
  content_type: "application/json" as const,
  secret_hint: null,
  secret_length: null,
  secret_updated_at: null,
}

describe("ProjectsDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockedListProjects.mockReset()
    mockedPreviewProjectFromGithubRepo.mockReset()
    mockedCreateProject.mockReset()
    mockedUpdateProject.mockReset()
    mockedToastError.mockReset()
    // reset 会清掉工厂里的默认实现，重新给上，否则面板会走错误分支。
    mockedGetGithubWebhookSettings.mockReset()
    mockedGetGithubWebhookSettings.mockResolvedValue(WEBHOOK_SETTINGS)
  })

  it("shows empty state after loading projects", async () => {
    window.localStorage.setItem("verhub-admin-token", "valid-token")
    mockedListProjects.mockResolvedValue({ total: 0, data: [] })

    render(React.createElement(ProjectsDashboard))

    expect(
      await screen.findByText("暂无项目，点击右上角“新增项目”创建第一条项目记录。"),
    ).toBeInTheDocument()
    expect(mockedListProjects).toHaveBeenCalledWith(
      "valid-token",
      { limit: 10, offset: 0 },
      expect.any(AbortSignal),
    )
  })

  it("clears token and asks re-login when backend returns 401", async () => {
    window.localStorage.setItem("verhub-admin-token", "expired-token")
    mockedListProjects.mockRejectedValue(new ApiError("Invalid bearer token", 401))

    render(React.createElement(ProjectsDashboard))

    expect(await screen.findByText("登录状态已过期，请重新登录。")).toBeInTheDocument()
    expect(mockedListProjects).toHaveBeenCalledWith(
      "expired-token",
      { limit: 10, offset: 0 },
      expect.any(AbortSignal),
    )
  })

  it("shows session prompt when no token exists", async () => {
    render(React.createElement(ProjectsDashboard))

    await waitFor(() => {
      expect(screen.getByText("请先在登录页完成登录后查看项目数据。")).toBeInTheDocument()
    })
    expect(mockedListProjects).not.toHaveBeenCalled()
  })

  it("renders project id in project list item", async () => {
    window.localStorage.setItem("verhub-admin-token", "valid-token")
    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "project-1",
          project_key: "verhub",
          name: "Verhub",
          repo_url: null,
          description: null,
          author: null,
          author_homepage_url: null,
          icon_url: null,
          website_url: null,
          docs_url: null,
          published_at: null,
          created_at: Math.floor(Date.parse("2026-03-20T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-03-20T00:00:00.000Z") / 1000),
        },
      ],
    })

    render(React.createElement(ProjectsDashboard))

    expect(await screen.findByText("ID: project-1")).toBeInTheDocument()
  })

  it("prefills project form from github repository metadata", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem("verhub-admin-token", "valid-token")
    mockedListProjects.mockResolvedValue({ total: 0, data: [] })
    mockedPreviewProjectFromGithubRepo.mockResolvedValue({
      project_key: "octocat-hello-world",
      name: "octocat/Hello-World",
      repo_url: "https://github.com/octocat/Hello-World",
      description: "GitHub hello world",
      author: "octocat",
      author_homepage_url: "https://github.com/octocat",
      icon_url: "https://avatars.githubusercontent.com/u/1?v=4",
      website_url: null,
      docs_url: null,
      published_at: null,
    })

    render(React.createElement(ProjectsDashboard))

    await user.click(await screen.findByRole("button", { name: "新增项目" }))
    const dialog = await screen.findByRole("dialog")
    const repoInput = within(dialog).getByPlaceholderText("https://github.com/org/repo")
    await user.type(repoInput, "https://github.com/octocat/Hello-World")
    await user.click(within(dialog).getByRole("button", { name: "从 GitHub 获取项目信息" }))

    await waitFor(() => {
      expect(mockedPreviewProjectFromGithubRepo).toHaveBeenCalledWith(
        "valid-token",
        "https://github.com/octocat/Hello-World",
      )
    })

    expect(within(dialog).getByDisplayValue("octocat-hello-world")).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("octocat/Hello-World")).toBeInTheDocument()
  })

  it("opens the create dialog prefilled when copying project config", async () => {
    const user = userEvent.setup()

    window.localStorage.setItem("verhub-admin-token", "valid-token")
    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "project-1",
          project_key: "verhub",
          name: "Verhub",
          repo_url: "https://github.com/verhub/verhub",
          description: "desc",
          author: null,
          author_homepage_url: null,
          icon_url: null,
          website_url: null,
          docs_url: null,
          published_at: null,
          created_at: Math.floor(Date.parse("2026-03-20T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-03-20T00:00:00.000Z") / 1000),
        },
      ],
    })

    render(React.createElement(ProjectsDashboard))

    await screen.findByText("ID: project-1")
    await user.click(screen.getByRole("button", { name: "复制配置" }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByDisplayValue("verhub")).toBeInTheDocument()
  })

  it("rejects invalid comparable range format before submit", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem("verhub-admin-token", "valid-token")
    mockedListProjects.mockResolvedValue({ total: 0, data: [] })

    render(React.createElement(ProjectsDashboard))

    await user.click(await screen.findByRole("button", { name: "新增项目" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByPlaceholderText("例如：verhub-admin"), "demo")
    await user.type(within(dialog).getByPlaceholderText("输入面向管理员展示的名称"), "Demo")
    await user.type(within(dialog).getByPlaceholderText("例如：1.0.0"), "abc")
    await user.click(within(dialog).getByRole("button", { name: "创建项目" }))

    expect(mockedToastError).toHaveBeenCalledWith("可选更新范围下限格式不合法。")
    expect(mockedCreateProject).not.toHaveBeenCalled()
  })

  it("sends null for optional range fields when clearing values during edit", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem("verhub-admin-token", "valid-token")
    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "project-1",
          project_key: "verhub",
          name: "Verhub",
          repo_url: "https://github.com/verhub/verhub",
          description: null,
          author: null,
          author_homepage_url: null,
          icon_url: null,
          website_url: null,
          docs_url: null,
          optional_update_min_comparable_version: "1.0.0",
          optional_update_max_comparable_version: "2.0.0",
          published_at: null,
          created_at: Math.floor(Date.parse("2026-03-20T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-03-20T00:00:00.000Z") / 1000),
        },
      ],
    })
    mockedUpdateProject.mockResolvedValue({
      id: "project-1",
      project_key: "verhub",
      name: "Verhub",
      repo_url: "https://github.com/verhub/verhub",
      description: null,
      author: null,
      author_homepage_url: null,
      icon_url: null,
      website_url: null,
      docs_url: null,
      optional_update_min_comparable_version: null,
      optional_update_max_comparable_version: null,
      published_at: null,
      created_at: Math.floor(Date.parse("2026-03-20T00:00:00.000Z") / 1000),
      updated_at: Math.floor(Date.parse("2026-03-20T00:00:00.000Z") / 1000),
    })

    render(React.createElement(ProjectsDashboard))

    await screen.findByText("ID: project-1")
    await user.click(screen.getByRole("button", { name: "编辑" }))

    const dialog = screen.getByRole("dialog")
    const minInput = within(dialog).getByPlaceholderText("例如：1.0.0")
    const maxInput = within(dialog).getByPlaceholderText("例如：1.99.99")

    await user.clear(minInput)
    await user.clear(maxInput)
    await user.click(within(dialog).getByRole("button", { name: "保存修改" }))

    await waitFor(() => {
      expect(mockedUpdateProject).toHaveBeenCalledWith(
        "valid-token",
        "verhub",
        expect.objectContaining({
          optional_update_min_comparable_version: null,
          optional_update_max_comparable_version: null,
        }),
      )
    })
  })

  /**
   * 守住「GitHub 集成」弹窗与 webhook 面板的接线。
   *
   * 面板自身的单测独立渲染组件，dashboard 忘记挂载它也照样全绿——功能因此可能
   * 整条链路可用但后台没有入口。这条断言是唯一能发现漏接线的地方。
   */
  it("renders the github webhook panel inside the github integration dialog", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem("verhub-admin-token", "valid-token")
    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "project-1",
          project_key: "verhub",
          name: "Verhub",
          repo_url: "https://github.com/verhub/verhub",
          description: null,
          author: null,
          author_homepage_url: null,
          icon_url: null,
          website_url: null,
          docs_url: null,
          optional_update_min_comparable_version: null,
          optional_update_max_comparable_version: null,
          published_at: null,
          created_at: Math.floor(Date.parse("2026-03-20T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-03-20T00:00:00.000Z") / 1000),
        },
      ],
    })

    render(React.createElement(ProjectsDashboard))

    await screen.findByText("ID: project-1")
    await user.click(screen.getByRole("button", { name: "GitHub 集成" }))

    const dialog = screen.getByRole("dialog")
    // GitHub App 与 Release Webhook 各占一个选项卡，后者要切过去才渲染。
    expect(await within(dialog).findByText("允许把反馈转发为 GitHub Issue")).toBeInTheDocument()
    // 还没配过目标仓库时，用项目自己的仓库地址预填。
    expect(within(dialog).getByDisplayValue("verhub/verhub")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("tab", { name: "Release Webhook" }))
    expect(await within(dialog).findByText("GitHub Release Webhook")).toBeInTheDocument()
    await waitFor(() => {
      expect(mockedGetGithubWebhookSettings).toHaveBeenCalledWith(
        "valid-token",
        "verhub",
        expect.any(AbortSignal),
      )
    })
  })
})
