import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api-client"
import { listProjects } from "@/lib/projects-api"

import { ProjectsDashboard } from "./projects-dashboard"

vi.mock("@/lib/projects-api", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

const mockedListProjects = vi.mocked(listProjects)

describe("ProjectsDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockedListProjects.mockReset()
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
          created_at: "2026-03-20T00:00:00.000Z",
          updated_at: "2026-03-20T00:00:00.000Z",
        },
      ],
    })

    render(React.createElement(ProjectsDashboard))

    expect(await screen.findByText("ID: project-1")).toBeInTheDocument()
  })
})
