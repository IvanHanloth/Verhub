import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listProjects } from "@/lib/projects-api"
import {
  listVersions,
  createVersion,
  deleteVersion,
  updateVersion,
  importVersionsFromGithubReleases,
  previewVersionFromGithubRelease,
} from "@/lib/versions-api"

import { VersionsDashboard } from "./versions-dashboard"

vi.mock("@/lib/projects-api", () => ({
  listProjects: vi.fn(),
}))

vi.mock("@/lib/versions-api", () => ({
  listVersions: vi.fn(),
  createVersion: vi.fn(),
  deleteVersion: vi.fn(),
  updateVersion: vi.fn(),
  importVersionsFromGithubReleases: vi.fn(),
  previewVersionFromGithubRelease: vi.fn(),
}))

const mockedListProjects = vi.mocked(listProjects)
const mockedListVersions = vi.mocked(listVersions)
const mockedCreateVersion = vi.mocked(createVersion)
const mockedDeleteVersion = vi.mocked(deleteVersion)
const mockedUpdateVersion = vi.mocked(updateVersion)
const mockedImportVersionsFromGithubReleases = vi.mocked(importVersionsFromGithubReleases)
const mockedPreviewVersionFromGithubRelease = vi.mocked(previewVersionFromGithubRelease)

describe("VersionsDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem("verhub-admin-token", "valid-token")

    mockedListProjects.mockReset()
    mockedListVersions.mockReset()
    mockedCreateVersion.mockReset()
    mockedDeleteVersion.mockReset()
    mockedUpdateVersion.mockReset()
    mockedImportVersionsFromGithubReleases.mockReset()
    mockedPreviewVersionFromGithubRelease.mockReset()

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
    mockedImportVersionsFromGithubReleases.mockResolvedValue({
      imported: 2,
      skipped: 1,
      scanned: 3,
    })

    mockedPreviewVersionFromGithubRelease.mockResolvedValue({
      version: "1.2.3",
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
          published_at: null,
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })

    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "从 GitHub 导入历史版本" }))

    await waitFor(() => {
      expect(mockedImportVersionsFromGithubReleases).toHaveBeenCalledWith(
        "valid-token",
        "project-1",
      )
    })

    expect(
      screen.getByText("历史版本导入完成：新增 2 条，跳过 1 条，共扫描 3 条。"),
    ).toBeInTheDocument()
  })

  it("edits existing version and submits update", async () => {
    const user = userEvent.setup()
    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "编辑版本" }))

    const titleInput = screen.getByLabelText("版本标题")
    await user.clear(titleInput)
    await user.type(titleInput, "稳定版-更新")

    await user.click(screen.getByRole("button", { name: "保存版本" }))

    await waitFor(() => {
      expect(mockedUpdateVersion).toHaveBeenCalledWith(
        "valid-token",
        "project-1",
        "version-1",
        expect.objectContaining({
          version: "1.0.0",
          title: "稳定版-更新",
          download_url: "https://example.com/1.0.0",
        }),
      )
    })

    expect(screen.getByText("版本已更新。")).toBeInTheDocument()
  })

  it("keeps previously selected project from shared storage", async () => {
    window.localStorage.setItem("verhub.admin.selectedProjectKey", "project-2")

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
          published_at: null,
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })

    render(React.createElement(VersionsDashboard))

    const select = await screen.findByLabelText("目标项目")
    await waitFor(() => {
      expect(select).toHaveValue("project-2")
    })
    expect(window.localStorage.getItem("verhub.admin.selectedProjectKey")).toBe("project-2")
  })

  it("copies version config into form for creating a new record", async () => {
    const user = userEvent.setup()
    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "复制配置" }))

    expect(screen.getByDisplayValue("1.0.0")).toBeInTheDocument()
    expect(screen.getByDisplayValue("稳定版")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "发布版本" })).toBeInTheDocument()
  })

  it("deletes version from list", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)

    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "删除版本" }))

    await waitFor(() => {
      expect(mockedDeleteVersion).toHaveBeenCalledWith("valid-token", "project-1", "version-1")
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
          published_at: null,
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })

    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "从 GitHub Release 获取" }))

    await waitFor(() => {
      expect(mockedPreviewVersionFromGithubRelease).toHaveBeenCalledWith(
        "valid-token",
        "project-1",
        { tag: undefined },
      )
    })

    expect(screen.getByPlaceholderText("例如：2.3.0")).toHaveValue("1.2.3")
    expect(screen.getByPlaceholderText("例如：2.3.0-rc.1（留空则尝试由版本号推导）")).toHaveValue(
      "1.2.3",
    )
    expect(screen.getByDisplayValue("Verhub v1.2.3")).toBeInTheDocument()
    expect(screen.getByLabelText("预发布版本")).toBeChecked()
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
          published_at: null,
          created_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
          updated_at: Math.floor(Date.parse("2026-01-01T00:00:00.000Z") / 1000),
        },
      ],
    })

    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    const versionInput = screen.getByPlaceholderText("例如：2.3.0")
    await user.clear(versionInput)
    await user.type(versionInput, "v2.0.0-beta.1")
    await user.click(screen.getByRole("button", { name: "从 GitHub Release 获取" }))

    await waitFor(() => {
      expect(mockedPreviewVersionFromGithubRelease).toHaveBeenCalledWith(
        "valid-token",
        "project-1",
        { tag: "v2.0.0-beta.1" },
      )
    })
  })
})
