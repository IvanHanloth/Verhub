import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DashboardShell } from "./dashboard-shell"

const replaceMock = vi.fn()
const refreshMock = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
  }),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
    theme: "light",
    setTheme: vi.fn(),
  }),
}))

describe("DashboardShell", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem("verhub-admin-token", "valid-token")
    replaceMock.mockReset()
    refreshMock.mockReset()
  })

  it("clears token and refreshes page on logout", async () => {
    render(
      <DashboardShell>
        <div>content</div>
      </DashboardShell>,
    )

    const button = await screen.findByRole("button", { name: "退出登录" })
    fireEvent.click(button)

    expect(window.localStorage.getItem("verhub-admin-token")).toBeNull()
    expect(replaceMock).toHaveBeenCalledWith("/")
    expect(refreshMock).toHaveBeenCalled()
  })
})
