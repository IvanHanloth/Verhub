import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listProjects } from "@/lib/projects-api"
import { listActions, listActionRecords } from "@/lib/actions-api"

import { ActionsDashboard } from "./actions-dashboard"

vi.mock("@/lib/projects-api", () => ({
  listProjects: vi.fn(),
}))

vi.mock("@/lib/actions-api", () => ({
  listActions: vi.fn(),
  listActionRecords: vi.fn(),
  createAction: vi.fn(),
  updateAction: vi.fn(),
  deleteAction: vi.fn(),
}))

const mockedListProjects = vi.mocked(listProjects)
const mockedListActions = vi.mocked(listActions)
const mockedListActionRecords = vi.mocked(listActionRecords)

describe("ActionsDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem("verhub-admin-token", "valid-token")

    mockedListProjects.mockReset()
    mockedListActions.mockReset()
    mockedListActionRecords.mockReset()

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

    mockedListActions.mockResolvedValue({
      total: 1,
      data: [
        {
          action_id: "action-1",
          project_key: "verhub",
          name: "打开设置",
          description: "用户点击设置入口",
          custom_data: null,
          created_time: 1710000000,
        },
      ],
    })

    mockedListActionRecords.mockResolvedValue({ total: 0, data: [] })
  })

  it("lists actions and reveals the id column on demand", async () => {
    const user = userEvent.setup()
    render(React.createElement(ActionsDashboard))

    expect(await screen.findByText("打开设置")).toBeInTheDocument()
    // 行为 ID 默认隐藏：排查时才需要，平时只会挤占宽度。
    expect(screen.queryByText("action-1")).not.toBeInTheDocument()

    const [actionsColumnToggle] = screen.getAllByRole("button", { name: /^列（/ })
    await user.click(actionsColumnToggle!)
    await user.click(screen.getByRole("checkbox", { name: "行为 ID" }))

    expect(screen.getByText("action-1")).toBeInTheDocument()
  })
})
