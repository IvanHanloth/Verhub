import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  EMPTY_SECRET_STATE,
  type WebhookSecretState,
} from "@/components/github/webhook-secret-field"
import type { GithubWebhookSettings as GithubWebhookSettingsView } from "@/lib/projects-api"

import { GithubWebhookSettings } from "./github-webhook-settings"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const DISABLED: GithubWebhookSettingsView = {
  enabled: false,
  payload_path: "/api/v1/webhooks/github/verhub",
  content_type: "application/json" as const,
  secret_hint: null,
  secret_length: null,
  secret_updated_at: null,
}

const ENABLED = {
  ...DISABLED,
  enabled: true,
  secret_hint: "abcd12",
  secret_length: 12,
  secret_updated_at: 1760000000,
}

function renderPanel(
  settings: GithubWebhookSettingsView | null,
  secret: WebhookSecretState = EMPTY_SECRET_STATE,
) {
  const onSecretChange = vi.fn()
  render(React.createElement(GithubWebhookSettings, { settings, secret, onSecretChange }))
  return { onSecretChange }
}

describe("GithubWebhookSettings", () => {
  it("shows the absolute payload url the operator has to paste into GitHub", () => {
    renderPanel(DISABLED)

    expect(
      screen.getByText(`${window.location.origin}/api/v1/webhooks/github/verhub`),
    ).toBeInTheDocument()
  })

  it("warns that deliveries are rejected while no secret is configured", () => {
    renderPanel(DISABLED)

    expect(screen.getByText("未配置 secret，所有推送都会被拒绝")).toBeInTheDocument()
  })

  it("masks a configured secret to its real length instead of echoing it", () => {
    renderPanel(ENABLED)

    // 12 位的 secret：6 个星号 + 末六位，长度对得上才看得出换没换过 secret。
    expect(screen.getByPlaceholderText("******abcd12")).toBeInTheDocument()
  })

  it("generates a secret locally so it can be copied before saving", async () => {
    const { onSecretChange } = renderPanel(DISABLED)

    await userEvent.click(screen.getByRole("button", { name: /重新生成/ }))

    const [next] = onSecretChange.mock.calls[0] as [WebhookSecretState]
    expect(next.cleared).toBe(false)
    expect(next.draft).toMatch(/^whsec_[0-9a-f]{48}$/)
  })

  it("marks the stored secret for removal in one click", async () => {
    const { onSecretChange } = renderPanel(ENABLED)

    await userEvent.click(screen.getByRole("button", { name: "清除 secret" }))

    expect(onSecretChange).toHaveBeenCalledWith({ draft: "", cleared: true })
  })

  it("offers no clear control when there is nothing to clear", () => {
    renderPanel(DISABLED)

    expect(screen.queryByRole("button", { name: "清除 secret" })).not.toBeInTheDocument()
  })

  it("renders only the instructions until the settings have loaded", () => {
    renderPanel(null)

    expect(screen.queryByText("Payload URL")).not.toBeInTheDocument()
    expect(screen.getByText("GitHub Release Webhook")).toBeInTheDocument()
  })
})
