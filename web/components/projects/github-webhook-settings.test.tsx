import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearGithubWebhookSecret,
  getGithubWebhookSettings,
  regenerateGithubWebhookSecret,
} from "@/lib/projects-api"

import { GithubWebhookSettings } from "./github-webhook-settings"

vi.mock("@/lib/projects-api", () => ({
  getGithubWebhookSettings: vi.fn(),
  regenerateGithubWebhookSecret: vi.fn(),
  setGithubWebhookSecret: vi.fn(),
  clearGithubWebhookSecret: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockedGet = vi.mocked(getGithubWebhookSettings)
const mockedRegenerate = vi.mocked(regenerateGithubWebhookSecret)
const mockedClear = vi.mocked(clearGithubWebhookSecret)

const DISABLED = {
  enabled: false,
  payload_path: "/api/v1/webhooks/github/verhub",
  content_type: "application/json" as const,
  secret_hint: null,
  secret_updated_at: null,
}

describe("GithubWebhookSettings", () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedRegenerate.mockReset()
    mockedClear.mockReset()
  })

  it("shows the absolute payload url the operator has to paste into GitHub", async () => {
    mockedGet.mockResolvedValue(DISABLED)

    render(React.createElement(GithubWebhookSettings, { token: "t", projectKey: "verhub" }))

    expect(
      await screen.findByText(`${window.location.origin}/api/v1/webhooks/github/verhub`),
    ).toBeInTheDocument()
  })

  it("warns that deliveries are rejected while no secret is configured", async () => {
    mockedGet.mockResolvedValue(DISABLED)

    render(React.createElement(GithubWebhookSettings, { token: "t", projectKey: "verhub" }))

    expect(await screen.findByText("未配置 secret，所有推送都会被拒绝")).toBeInTheDocument()
  })

  it("reveals a regenerated secret once, since the API never returns it again", async () => {
    mockedGet.mockResolvedValue(DISABLED)
    mockedRegenerate.mockResolvedValue({
      ...DISABLED,
      enabled: true,
      secret_hint: "cd12",
      secret_updated_at: 1760000000,
      secret: "whsec_abcd1234567890abcd12",
    })

    render(React.createElement(GithubWebhookSettings, { token: "t", projectKey: "verhub" }))
    await userEvent.click(await screen.findByRole("button", { name: /重新生成 Secret/ }))

    await waitFor(() => {
      expect(screen.getByText("whsec_abcd1234567890abcd12")).toBeInTheDocument()
    })
    expect(screen.getByText(/请立即复制并填入 GitHub，关闭弹窗后无法再次查看/)).toBeInTheDocument()
  })

  it("keeps the clear button unavailable when there is nothing to clear", async () => {
    mockedGet.mockResolvedValue(DISABLED)

    render(React.createElement(GithubWebhookSettings, { token: "t", projectKey: "verhub" }))

    expect(await screen.findByRole("button", { name: /清除 Secret/ })).toBeDisabled()
    expect(mockedClear).not.toHaveBeenCalled()
  })

  it("renders nothing until a project is being edited", () => {
    const { container } = render(
      React.createElement(GithubWebhookSettings, { token: "t", projectKey: null }),
    )

    expect(container).toBeEmptyDOMElement()
    expect(mockedGet).not.toHaveBeenCalled()
  })
})
