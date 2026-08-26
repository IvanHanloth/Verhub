import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import TranslationSettingsPage from "./page"

import { getSessionToken } from "@/lib/auth-session"
import {
  clearTranslationConfig,
  getTranslationConfig,
  testTranslation,
  updateTranslationConfig,
  type TranslationConfigView,
} from "@/lib/translation-api"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/auth-session", () => ({
  getSessionToken: vi.fn(),
}))

vi.mock("@/lib/translation-api", () => ({
  getTranslationConfig: vi.fn(),
  updateTranslationConfig: vi.fn(),
  clearTranslationConfig: vi.fn(),
  testTranslation: vi.fn(),
}))

vi.mock("@/components/common/confirm-dialog", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}))

const BUILTIN_PROMPT = "你是软件产品的本地化译者。只输出一个 JSON 对象。"

const CONFIGURED: TranslationConfigView = {
  configured: true,
  enabled: true,
  provider: "openai",
  base_url: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  has_api_key: true,
  api_key_fingerprint: "abc123def4567890",
  api_key_updated_at: 1785196800,
  custom_prompt: false,
  system_prompt: null,
  builtin_system_prompt: BUILTIN_PROMPT,
  prompt_variables: ["target_locale", "target_label", "source_locale"],
  request_url: "https://api.openai.com/v1/chat/completions",
  updated_at: 1785196800,
}

const EMPTY: TranslationConfigView = {
  ...CONFIGURED,
  configured: false,
  enabled: false,
  base_url: null,
  model: null,
  has_api_key: false,
  api_key_fingerprint: null,
  api_key_updated_at: null,
  request_url: null,
  updated_at: null,
}

const mockedGetSessionToken = vi.mocked(getSessionToken)
const mockedGetConfig = vi.mocked(getTranslationConfig)
const mockedUpdateConfig = vi.mocked(updateTranslationConfig)
const mockedClearConfig = vi.mocked(clearTranslationConfig)
const mockedTest = vi.mocked(testTranslation)

beforeEach(() => {
  vi.clearAllMocks()
  mockedGetSessionToken.mockReturnValue("token")
  mockedGetConfig.mockResolvedValue(CONFIGURED)
  mockedUpdateConfig.mockResolvedValue(CONFIGURED)
  mockedClearConfig.mockResolvedValue(EMPTY)
})

describe("TranslationSettingsPage", () => {
  it("shows the stored config and the api key fingerprint instead of the key", async () => {
    render(React.createElement(TranslationSettingsPage))

    expect(await screen.findByDisplayValue("https://api.openai.com/v1")).toBeInTheDocument()
    expect(screen.getByDisplayValue("gpt-4o-mini")).toBeInTheDocument()
    expect(screen.getByText(/abc123def4567890/)).toBeInTheDocument()
    expect(screen.getByText("已启用")).toBeInTheDocument()
  })

  it("echoes the full request url so the base url can be checked before saving", async () => {
    render(React.createElement(TranslationSettingsPage))

    expect(
      await screen.findByText("https://api.openai.com/v1/chat/completions"),
    ).toBeInTheDocument()
  })

  it("switches the appended path when the provider changes", async () => {
    const user = userEvent.setup()
    render(React.createElement(TranslationSettingsPage))

    await user.click(await screen.findByRole("button", { name: "Anthropic Messages" }))

    expect(screen.getByText("https://api.openai.com/v1/v1/messages")).toBeInTheDocument()
  })

  it("does not resend the api key when it was left untouched", async () => {
    const user = userEvent.setup()
    render(React.createElement(TranslationSettingsPage))

    await user.click(await screen.findByRole("button", { name: /保存配置/ }))

    await waitFor(() => {
      expect(mockedUpdateConfig).toHaveBeenCalled()
    })
    expect(mockedUpdateConfig.mock.calls[0]?.[1]).not.toHaveProperty("api_key")
  })

  it("sends the new api key once it is typed", async () => {
    const user = userEvent.setup()
    render(React.createElement(TranslationSettingsPage))

    await user.type(await screen.findByPlaceholderText("已配置，留空即保持不变"), "sk-new-key")
    await user.click(screen.getByRole("button", { name: /保存配置/ }))

    await waitFor(() => {
      expect(mockedUpdateConfig.mock.calls[0]?.[1]).toMatchObject({ api_key: "sk-new-key" })
    })
  })

  it("does not send the system prompt while the custom switch is off", async () => {
    const user = userEvent.setup()
    render(React.createElement(TranslationSettingsPage))

    await user.click(await screen.findByRole("button", { name: /保存配置/ }))

    await waitFor(() => {
      expect(mockedUpdateConfig).toHaveBeenCalled()
    })
    const payload = mockedUpdateConfig.mock.calls[0]?.[1]
    expect(payload).toMatchObject({ custom_prompt: false })
    expect(payload).not.toHaveProperty("system_prompt")
  })

  it("seeds the prompt editor with the builtin text so no one starts from a blank page", async () => {
    const user = userEvent.setup()
    render(React.createElement(TranslationSettingsPage))

    await user.click(await screen.findByRole("checkbox", { name: /使用自定义提示词/ }))

    expect(screen.getByLabelText(/系统提示词/)).toHaveValue(BUILTIN_PROMPT)
  })

  it("reports a failed test connection on the page instead of swallowing it", async () => {
    const user = userEvent.setup()
    mockedTest.mockResolvedValue({
      ok: false,
      provider: "openai",
      model: "gpt-4o-mini",
      request_url: "https://api.openai.com/v1/chat/completions",
      sample: null,
      latency_ms: 120,
      error: "https://api.openai.com/v1/chat/completions 返回 401：invalid api key",
    })

    render(React.createElement(TranslationSettingsPage))
    await user.click(await screen.findByRole("button", { name: /测试连接/ }))

    expect(await screen.findByText(/invalid api key/)).toBeInTheDocument()
  })

  it("shows the sample translation when the test succeeds", async () => {
    const user = userEvent.setup()
    mockedTest.mockResolvedValue({
      ok: true,
      provider: "openai",
      model: "gpt-4o-mini",
      request_url: "https://api.openai.com/v1/chat/completions",
      sample: "This update fixes a few issues.",
      latency_ms: 830,
      error: null,
    })

    render(React.createElement(TranslationSettingsPage))
    await user.click(await screen.findByRole("button", { name: /测试连接/ }))

    expect(await screen.findByText(/This update fixes a few issues./)).toBeInTheDocument()
  })

  it("clears the form after the config is cleared", async () => {
    const user = userEvent.setup()
    render(React.createElement(TranslationSettingsPage))

    await user.click(await screen.findByRole("button", { name: /清空配置/ }))

    await waitFor(() => {
      expect(mockedClearConfig).toHaveBeenCalledWith("token")
    })
    expect(screen.getByPlaceholderText("https://api.openai.com/v1")).toHaveValue("")
    expect(screen.getByText("未完成配置")).toBeInTheDocument()
  })
})
