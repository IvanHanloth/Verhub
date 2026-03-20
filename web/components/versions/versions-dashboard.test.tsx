import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listProjects } from "@/lib/projects-api"
import { listVersions, createVersion, updateVersion } from "@/lib/versions-api"

import { VersionsDashboard } from "./versions-dashboard"

vi.mock("@/lib/projects-api", () => ({
  listProjects: vi.fn(),
}))

vi.mock("@/lib/versions-api", () => ({
  listVersions: vi.fn(),
  createVersion: vi.fn(),
  updateVersion: vi.fn(),
}))

const mockedListProjects = vi.mocked(listProjects)
const mockedListVersions = vi.mocked(listVersions)
const mockedCreateVersion = vi.mocked(createVersion)
const mockedUpdateVersion = vi.mocked(updateVersion)

describe("VersionsDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem("verhub-admin-token", "valid-token")

    mockedListProjects.mockReset()
    mockedListVersions.mockReset()
    mockedCreateVersion.mockReset()
    mockedUpdateVersion.mockReset()

    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [
        {
          id: "project-1",
          project_key: "verhub",
          name: "Verhub",
          repo_url: null,
          description: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
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
          forced: false,
          platform: "web",
          custom_data: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    })

    mockedUpdateVersion.mockResolvedValue({
      id: "version-1",
      version: "1.0.0",
      title: "稳定版-更新",
      content: "new content",
      download_url: "https://example.com/1.0.0",
      forced: false,
      platform: "web",
      custom_data: null,
      created_at: "2026-01-01T00:00:00.000Z",
    })
  })

  it("edits existing version and submits update", async () => {
    const user = userEvent.setup()
    render(React.createElement(VersionsDashboard))

    await screen.findByText("1.0.0")
    await user.click(screen.getByRole("button", { name: "编辑版本" }))

    const titleInput = screen.getByLabelText("版本标题（可选）")
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
})
