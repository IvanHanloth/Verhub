import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listProjects } from "@/lib/projects-api"
import { notifyAdminProjectsChanged } from "@/hooks/use-admin-projects"

import { SidebarProjectSwitcher } from "./sidebar-project-switcher"

vi.mock("@/lib/projects-api", () => ({
  listProjects: vi.fn(),
}))

const mockedListProjects = vi.mocked(listProjects)

function project(key: string, name: string) {
  return {
    id: key,
    project_key: key,
    name,
    repo_url: null,
    description: null,
    author: null,
    author_homepage_url: null,
    icon_url: null,
    website_url: null,
    published_at: null,
    created_at: 0,
    updated_at: 0,
  }
}

describe("SidebarProjectSwitcher", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem("verhub-admin-token", "valid-token")
    mockedListProjects.mockReset()
    mockedListProjects.mockResolvedValue({
      total: 2,
      data: [project("verhub", "Verhub"), project("client", "Client")],
    })
  })

  it("auto-selects the first project and persists the shared selection", async () => {
    render(<SidebarProjectSwitcher />)

    const select = await screen.findByLabelText("当前项目")
    await waitFor(() => {
      expect(select).toHaveValue("verhub")
    })
    expect(window.localStorage.getItem("verhub.admin.selectedProjectKey")).toBe("verhub")
  })

  it("writes the picked project back to shared storage", async () => {
    const user = userEvent.setup()
    render(<SidebarProjectSwitcher />)

    const select = await screen.findByLabelText("当前项目")
    await waitFor(() => expect(select).toHaveValue("verhub"))

    await user.selectOptions(select, "client")

    expect(window.localStorage.getItem("verhub.admin.selectedProjectKey")).toBe("client")
  })

  it("reloads the list when project management reports a change", async () => {
    render(<SidebarProjectSwitcher />)

    await screen.findByRole("option", { name: "Client" })

    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [project("verhub", "Verhub")],
    })
    notifyAdminProjectsChanged()

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: "Client" })).not.toBeInTheDocument()
    })
  })

  it("falls back to another project once the selected one is deleted", async () => {
    window.localStorage.setItem("verhub.admin.selectedProjectKey", "client")
    mockedListProjects.mockResolvedValue({
      total: 1,
      data: [project("verhub", "Verhub")],
    })

    render(<SidebarProjectSwitcher />)

    const select = await screen.findByLabelText("当前项目")
    await waitFor(() => {
      expect(select).toHaveValue("verhub")
    })
  })
})
