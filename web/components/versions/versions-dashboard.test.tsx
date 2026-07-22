import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import { listProjects } from "@/lib/projects-api"
import {
  checkVersionUpdate,
  listVersions,
  createVersion,
  deleteVersion,
  updateVersion,
  importVersionsFromGithubReleases,
  previewVersionFromGithubRelease,
  upsertVersionByVersion,
} from "@/lib/versions-api"

import { VersionsDashboard } from "./versions-dashboard"

vi.mock("@/lib/projects-api", () => ({
  listProjects: vi.fn(),
}))

vi.mock("@/lib/versions-api", () => ({
  checkVersionUpdate: vi.fn(),
  listVersions: vi.fn(),
  createVersion: vi.fn(),
  deleteVersion: vi.fn(),
  updateVersion: vi.fn(),
  importVersionsFromGithubReleases: vi.fn(),
  previewVersionFromGithubRelease: vi.fn(),
  upsertVersionByVersion: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockedListProjects = vi.mocked(listProjects)
const mockedCheckVersionUpdate = vi.mocked(checkVersionUpdate)
const mockedListVersions = vi.mocked(listVersions)
const mockedCreateVersion = vi.mocked(createVersion)
const mockedDeleteVersion = vi.mocked(deleteVersion)
const mockedUpdateVersion = vi.mocked(updateVersion)
const mockedImportVersionsFromGithubReleases = vi.mocked(importVersionsFromGithubReleases)
const mockedPreviewVersionFromGithubRelease = vi.mocked(previewVersionFromGithubRelease)
const mockedUpsertVersionByVersion = vi.mocked(upsertVersionByVersion)
const mockedToastSuccess = vi.mocked(toast.success)
const mockedToastError = vi.mocked(toast.error)

describe("VersionsDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem("verhub-admin-token", "valid-token")

    mockedListProjects.mockReset()
    mockedListVersions.mockReset()
    mockedCheckVersionUpdate.mockReset()
    mockedCreateVersion.mockReset()
    mockedDeleteVersion.mockReset()
    mockedUpdateVersion.mockReset()
    mockedImportVersionsFromGithubReleases.mockReset()
    mockedPreviewVersionFromGithubRelease.mockReset()
    mockedUpsertVersionByVersion.mockReset()
    mockedToastSuccess.mockReset()
    mockedToastError.mockReset()

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
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })

    mockedListVersions.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "version-1",
          version: "1.0.0",
          comparable_version: "1.0.0",
          title: "稳定版",
          content: "old content",
          download_url: "https://example.com/1.0.0",
          download_links: [{ url: "https://example.com/1.0.0", name: "Web 包", platform: "web" }],
          forced: false,
          is_latest: true,
          is_preview: false,
          platform: "web",
          custom_data: null,
          published_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })

    mockedUpdateVersion.mockResolvedValue({
      id: "version-1",
      version: "1.0.0",
      comparable_version: "1.0.0",
      title: "稳定版-更新",
      content: "new content",
      download_url: "https://example.com/1.0.0",
      download_links: [{ url: "https://example.com/1.0.0", name: "Web 包", platform: "web" }],
      forced: false,
      is_latest: true,
      is_preview: false,
      platform: "web",
      custom_data: null,
      published_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
      created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
    })

    mockedDeleteVersion.mockResolvedValue({ success: true })
    mockedCheckVersionUpdate.mockResolvedValue({
      should_update: true,
      required: false,
      reason_codes: ["newer_version_available"],
      current_version: "1.0.0",
      current_comparable_version: "1.0.0",
      latest_version: {
        id: "version-latest",
        version: "1.1.0",
        comparable_version: "1.1.0",
        title: "latest",
        content: null,
        download_url: null,
        download_links: [],
        forced: false,
        is_latest: true,
        is_preview: false,
        platform: null,
        custom_data: null,
        published_at: 1774087200,
        created_at: 1774087200,
      },
      latest_preview_version: null,
      target_version: {
        id: "version-latest",
        version: "1.1.0",
        comparable_version: "1.1.0",
        title: "latest",
        content: null,
        download_url: null,
        download_links: [],
        forced: false,
        is_latest: true,
        is_preview: false,
        platform: null,
        custom_data: null,
        published_at: 1774087200,
        created_at: 1774087200,
      },
      milestone: {
        current: false,
        latest: false,
        target_is_milestone: false,
      },
    })
    mockedImportVersionsFromGithubReleases.mockResolvedValue({
      imported: 2,
      skipped: 1,
      scanned: 3,
    })

    mockedPreviewVersionFromGithubRelease.mockResolvedValue({
      version: "1.2.3",
      comparable_version: "1.2.3",
      title: "Verhub v1.2.3",
      content: "release note",
      download_url: "https://downloads.example.com/verhub-1.2.3.zip",
      download_links: [
        { url: "https://downloads.example.com/verhub-1.2.3.zip", name: "verhub-1.2.3.zip" },
      ],
      forced: false,
      platform: "web",
      is_latest: false,
      is_preview: true,
      published_at: 1774087200,
      custom_data: { source: "github-release" },
    })
  })

  it("imports version history from github and shows summary", async () => {
    const user = userEvent.setup()

    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "project-1",
          project_key: "verhub",
          name: "Verhub",
          repo_url: "https://github.com/octocat/Hello-World",
          description: null,
          author: null,
          author_homepage_url: null,
          icon_url: null,
          website_url: null,
          docs_url: null,
          published_at: null,
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })

    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "同步历史版本" }))

    await waitFor(() => {
      expect(mockedImportVersionsFromGithubReleases).toHaveBeenCalledWith("valid-token", "verhub")
    })
    expect(mockedToastSuccess).toHaveBeenCalledWith(
      "历史版本导入完成：新增 2 条，跳过 1 条，共扫描 3 条。",
    )
  })

  it("edits existing version and submits update", async () => {
    const user = userEvent.setup()
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "编辑版本" }))
    expect(scrollSpy).not.toHaveBeenCalled()

    const dialog = screen.getByRole("dialog")
    // 窄屏铺满整屏，sm 起才回到限高的居中卡片。
    expect(dialog.className).toContain("h-dvh")
    expect(dialog.className).toContain("sm:max-h-[calc(100dvh-2rem)]")

    const dialogBody = dialog.querySelector('[data-slot="dialog-body"]')
    expect(dialogBody).not.toBeNull()
    expect(dialogBody?.className).toContain("overflow-y-auto")

    const titleInput = screen.getByLabelText("版本标题")
    await user.clear(titleInput)
    await user.type(titleInput, "稳定版-更新")

    await user.click(screen.getByRole("button", { name: "保存版本" }))

    await waitFor(() => {
      expect(mockedUpdateVersion).toHaveBeenCalledWith(
        "valid-token",
        "verhub",
        "version-1",
        expect.objectContaining({
          version: "1.0.0",
          title: "稳定版-更新",
          download_url: "https://example.com/1.0.0",
        }),
      )
    })
    expect(mockedToastSuccess).toHaveBeenCalledWith(
      "版本已更新。之前的 latest 版本标记已自动重置。",
    )
    scrollSpy.mockRestore()
  })

  it("keeps previously selected project from shared storage", async () => {
    window.localStorage.setItem("verhub.admin.selectedProjectKey", "client")

    mockedListProjects.mockResolvedValueOnce({
      total: 2,
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
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
        {
          id: "project-2",
          project_key: "client",
          name: "Client",
          repo_url: null,
          description: null,
          author: null,
          author_homepage_url: null,
          icon_url: null,
          website_url: null,
          docs_url: null,
          published_at: null,
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })

    // 项目选择器已移到侧边栏，这里验证共享选中值仍然决定加载哪个项目的版本。
    render(React.createElement(VersionsDashboard))

    await waitFor(() => {
      expect(mockedListVersions).toHaveBeenCalledWith(
        "valid-token",
        "client",
        expect.anything(),
        expect.anything(),
      )
    })
    expect(window.localStorage.getItem("verhub.admin.selectedProjectKey")).toBe("client")
  })

  it("copies version config into form for creating a new record", async () => {
    const user = userEvent.setup()
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "复制配置" }))
    expect(scrollSpy).not.toHaveBeenCalled()

    // 复制配置直接把新建弹窗顶出来，省掉“复制完还要自己去点新增”的一步。
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByPlaceholderText("例如：2.3.0")).toHaveValue("1.0.0")
    expect(within(dialog).getByDisplayValue("稳定版")).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "发布版本" })).toBeInTheDocument()
    scrollSpy.mockRestore()
  })

  it("deletes version from list", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)

    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "删除版本" }))

    await waitFor(() => {
      expect(mockedDeleteVersion).toHaveBeenCalledWith("valid-token", "verhub", "version-1")
    })
  })

  it("prefills form from github release preview", async () => {
    const user = userEvent.setup()

    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "project-1",
          project_key: "verhub",
          name: "Verhub",
          repo_url: "https://github.com/octocat/Hello-World",
          description: null,
          author: null,
          author_homepage_url: null,
          icon_url: null,
          website_url: null,
          docs_url: null,
          published_at: null,
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })

    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "新增版本" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "按版本号获取 Release 信息" }))

    await waitFor(() => {
      expect(mockedPreviewVersionFromGithubRelease).toHaveBeenCalledWith("valid-token", "verhub", {
        tag: undefined,
      })
    })

    expect(within(dialog).getByPlaceholderText("例如：2.3.0")).toHaveValue("1.2.3")
    expect(within(dialog).getByPlaceholderText("例如：2.3.0-rc.1")).toHaveValue("1.2.3")
    expect(within(dialog).getByDisplayValue("Verhub v1.2.3")).toBeInTheDocument()
    expect(within(dialog).getByLabelText("预发布版本")).toBeChecked()
  })

  it("syncs the latest github release into the version list", async () => {
    const user = userEvent.setup()

    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "project-1",
          project_key: "verhub",
          name: "Verhub",
          repo_url: "https://github.com/octocat/Hello-World",
          description: null,
          author: null,
          author_homepage_url: null,
          icon_url: null,
          website_url: null,
          docs_url: null,
          published_at: null,
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })

    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "同步最新 Release" }))

    // 走 upsert：同一个 Release 反复同步不应该撞版本号唯一约束。
    await waitFor(() => {
      expect(mockedUpsertVersionByVersion).toHaveBeenCalledWith(
        "valid-token",
        "verhub",
        "1.2.3",
        expect.objectContaining({ version: "1.2.3", title: "Verhub v1.2.3" }),
      )
    })
    expect(mockedToastSuccess).toHaveBeenCalledWith("已同步最新 Release 1.2.3。")
  })

  it("requests specified release tag when version input is provided", async () => {
    const user = userEvent.setup()

    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "project-1",
          project_key: "verhub",
          name: "Verhub",
          repo_url: "https://github.com/octocat/Hello-World",
          description: null,
          author: null,
          author_homepage_url: null,
          icon_url: null,
          website_url: null,
          docs_url: null,
          published_at: null,
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })

    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "新增版本" }))
    const dialog = await screen.findByRole("dialog")
    const versionInput = within(dialog).getByPlaceholderText("例如：2.3.0")
    await user.clear(versionInput)
    await user.type(versionInput, "v2.0.0-beta.1")
    await user.click(within(dialog).getByRole("button", { name: "按版本号获取 Release 信息" }))

    await waitFor(() => {
      expect(mockedPreviewVersionFromGithubRelease).toHaveBeenCalledWith("valid-token", "verhub", {
        tag: "v2.0.0-beta.1",
      })
    })
  })

  it("shows explicit toast when github release fetch fails", async () => {
    const user = userEvent.setup()

    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "project-1",
          project_key: "verhub",
          name: "Verhub",
          repo_url: "https://github.com/octocat/Hello-World",
          description: null,
          author: null,
          author_homepage_url: null,
          icon_url: null,
          website_url: null,
          docs_url: null,
          published_at: null,
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })
    mockedPreviewVersionFromGithubRelease.mockRejectedValue(new Error("HTTP 404"))

    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "新增版本" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "按版本号获取 Release 信息" }))

    await waitFor(() => {
      expect(mockedToastError).toHaveBeenCalledWith("GitHub Release 获取失败：HTTP 404")
    })
  })
})
