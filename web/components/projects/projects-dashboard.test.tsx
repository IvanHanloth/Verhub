import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import { ApiError } from "@/lib/api-client"
import {
  createProject,
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
const mockedToastError = vi.mocked(toast.error)

describe("ProjectsDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockedListProjects.mockReset()
    mockedPreviewProjectFromGithubRepo.mockReset()
    mockedCreateProject.mockReset()
    mockedUpdateProject.mockReset()
    mockedToastError.mockReset()
  })

  it("shows empty state after loading projects", async () => {
    window.localStorage.setItem("verhub-admin-token", "valid-token")
    mockedListProjects.mockResolvedValue({ total: 0, data: [] })

    render(React.createElement(ProjectsDashboard))

    expect(
      await screen.findByText("暂无项目，使用上方表单创建第一条项目记录。"),
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
      published_at: null,
    })

    render(React.createElement(ProjectsDashboard))

    const repoInput = await screen.findByPlaceholderText("https://github.com/org/repo")
    await user.type(repoInput, "https://github.com/octocat/Hello-World")
    await user.click(screen.getByRole("button", { name: "从 GitHub 获取项目信息" }))

    await waitFor(() => {
      expect(mockedPreviewProjectFromGithubRepo).toHaveBeenCalledWith(
        "valid-token",
        "https://github.com/octocat/Hello-World",
      )
    })

    expect(screen.getByDisplayValue("octocat-hello-world")).toBeInTheDocument()
    expect(screen.getByDisplayValue("octocat/Hello-World")).toBeInTheDocument()
  })

  it("scrolls to top when copying project config", async () => {
    const user = userEvent.setup()
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)

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
          published_at: null,
          created_at: Math.floor(Date.parse("2026-03-20T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-03-20T00:00:00.000Z") / 1000),
        },
      ],
    })

    render(React.createElement(ProjectsDashboard))

    await screen.findByText("ID: project-1")
    await user.click(screen.getByRole("button", { name: "复制配置" }))

    expect(scrollSpy).toHaveBeenCalled()
    scrollSpy.mockRestore()
  })

  it("rejects invalid comparable range format before submit", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem("verhub-admin-token", "valid-token")
    mockedListProjects.mockResolvedValue({ total: 0, data: [] })

    render(React.createElement(ProjectsDashboard))

    const keyInput = await screen.findByPlaceholderText("例如：verhub-admin")
    await user.type(keyInput, "demo")
    await user.type(screen.getByPlaceholderText("输入面向管理员展示的名称"), "Demo")
    await user.type(screen.getByPlaceholderText("例如：1.0.0"), "abc")
    await user.click(screen.getByRole("button", { name: "创建项目" }))

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
})
