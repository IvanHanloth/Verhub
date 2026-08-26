import { BadGatewayException, BadRequestException } from "@nestjs/common"

import { type ResolvedTranslationConfig } from "./translation-config.service"
import { TranslationService } from "./translation.service"
import { MAX_TRANSLATION_INPUT_CHARS } from "./types"

const OPENAI_CONFIG: ResolvedTranslationConfig = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-test",
  model: "gpt-4o-mini",
  systemPrompt: "把内容翻译成 {{target_label}}（{{target_locale}}）。",
}

const ANTHROPIC_CONFIG: ResolvedTranslationConfig = {
  ...OPENAI_CONFIG,
  provider: "anthropic",
  baseUrl: "https://api.anthropic.com",
  model: "claude-sonnet-4-5",
}

const LOCALES = [{ locale: "en", aliases: ["en-US"], label: "English" }]

function createService(
  options: {
    config?: ResolvedTranslationConfig | null
    locales?: typeof LOCALES
  } = {},
) {
  const prisma = {
    projectLocale: {
      findMany: jest.fn().mockResolvedValue(options.locales ?? LOCALES),
    },
  }
  const projectResolver = {
    resolveCanonicalKeyOrThrow: jest.fn().mockResolvedValue("verhub"),
  }
  const configService = {
    resolve: jest
      .fn()
      .mockResolvedValue(options.config === undefined ? OPENAI_CONFIG : options.config),
    getView: jest.fn().mockResolvedValue({
      enabled: true,
      provider: "openai",
      model: "gpt-4o-mini",
      request_url: "https://api.openai.com/v1/chat/completions",
    }),
  }

  return {
    service: new TranslationService(
      prisma as never,
      projectResolver as never,
      configService as never,
    ),
    prisma,
    configService,
  }
}

/** 造一个 fetch 回包。openai 与 anthropic 的回包形状不同。 */
function reply(provider: "openai" | "anthropic", text: string) {
  const payload =
    provider === "anthropic"
      ? { content: [{ type: "text", text }] }
      : { choices: [{ message: { content: text } }] }

  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  }
}

function failure(status: number, body: string) {
  return { ok: false, status, text: () => Promise.resolve(body), json: () => Promise.resolve(null) }
}

const fetchMock = jest.fn()

describe("TranslationService", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as never
  })

  const translate = {
    kind: "announcement" as const,
    target_locale: "en",
    fields: { title: "新版本", content: "修了几个问题" },
  }

  it("sends an openai chat completion and fills every requested field", async () => {
    const { service } = createService()
    fetchMock.mockResolvedValue(
      reply("openai", JSON.stringify({ title: "New release", content: "Bug fixes" })),
    )

    const result = await service.translate("verhub", translate)

    expect(result).toEqual({
      locale: "en",
      provider: "openai",
      model: "gpt-4o-mini",
      fields: { title: "New release", content: "Bug fixes" },
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.openai.com/v1/chat/completions")
    expect(init.headers.Authorization).toBe("Bearer sk-test")
    const body = JSON.parse(init.body)
    expect(body.model).toBe("gpt-4o-mini")
    expect(body.response_format).toEqual({ type: "json_object" })
    // 语言展示名进了系统提示词：模型看「English」比看 en 准。
    expect(body.messages[0].content).toContain("English")
  })

  it("sends an anthropic message with the api key header and max_tokens", async () => {
    const { service } = createService({ config: ANTHROPIC_CONFIG })
    fetchMock.mockResolvedValue(
      reply("anthropic", JSON.stringify({ title: "New release", content: "Bug fixes" })),
    )

    await service.translate("verhub", translate)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.anthropic.com/v1/messages")
    expect(init.headers["x-api-key"]).toBe("sk-test")
    expect(init.headers["anthropic-version"]).toBe("2023-06-01")
    expect(init.headers.Authorization).toBeUndefined()
    const body = JSON.parse(init.body)
    expect(body.system).toContain("English")
    expect(body.max_tokens).toBeGreaterThan(0)
  })

  it("omits the auth header when no api key is configured", async () => {
    const { service } = createService({ config: { ...OPENAI_CONFIG, apiKey: null } })
    fetchMock.mockResolvedValue(reply("openai", JSON.stringify({ title: "a", content: "b" })))

    await service.translate("verhub", translate)

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it("retries without response_format when the upstream rejects it", async () => {
    const { service } = createService()
    fetchMock
      .mockResolvedValueOnce(failure(400, "response_format is not supported"))
      .mockResolvedValueOnce(reply("openai", JSON.stringify({ title: "a", content: "b" })))

    const result = await service.translate("verhub", translate)

    expect(result.fields).toEqual({ title: "a", content: "b" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toBeUndefined()
  })

  it("does not retry on failures other than 400", async () => {
    const { service } = createService()
    fetchMock.mockResolvedValue(failure(401, "invalid api key"))

    await expect(service.translate("verhub", translate)).rejects.toThrow(/401/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("parses a json object wrapped in a code fence", async () => {
    const { service } = createService()
    fetchMock.mockResolvedValue(
      reply("openai", '```json\n{"title": "New release", "content": "Bug fixes"}\n```'),
    )

    expect((await service.translate("verhub", translate)).fields.title).toBe("New release")
  })

  it("rejects a reply that is not a json object", async () => {
    const { service } = createService()
    fetchMock.mockResolvedValue(reply("openai", "当然可以！这是译文：New release"))

    await expect(service.translate("verhub", translate)).rejects.toBeInstanceOf(BadGatewayException)
  })

  it("rejects a reply that drops one of the requested fields", async () => {
    const { service } = createService()
    fetchMock.mockResolvedValue(reply("openai", JSON.stringify({ title: "New release" })))

    await expect(service.translate("verhub", translate)).rejects.toBeInstanceOf(BadGatewayException)
  })

  it("joins every text block of an anthropic reply", async () => {
    const { service } = createService({ config: ANTHROPIC_CONFIG })
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          content: [
            { type: "thinking", thinking: "先看看格式" },
            { type: "text", text: '{"title": "New' },
            { type: "text", text: ' release", "content": "Bug fixes"}' },
          ],
        }),
      text: () => Promise.resolve(""),
    })

    expect((await service.translate("verhub", translate)).fields.title).toBe("New release")
  })

  it("matches the target locale case-insensitively through an alias", async () => {
    const { service } = createService()
    fetchMock.mockResolvedValue(reply("openai", JSON.stringify({ title: "a", content: "b" })))

    // en-us 是 en 的同义标签，译文按主标签 en 存，所以返回的必须是 en。
    const result = await service.translate("verhub", { ...translate, target_locale: "en-us" })

    expect(result.locale).toBe("en")
  })

  it("rejects a locale the project has not registered", async () => {
    const { service } = createService()

    await expect(
      service.translate("verhub", { ...translate, target_locale: "ja" }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a field outside the kind's list", async () => {
    const { service } = createService()

    await expect(
      service.translate("verhub", { ...translate, fields: { author: "ivan" } }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("drops empty fields and rejects when nothing is left", async () => {
    const { service } = createService()

    await expect(
      service.translate("verhub", { ...translate, fields: { title: "  ", content: "" } }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("only sends the non-empty fields", async () => {
    const { service } = createService()
    fetchMock.mockResolvedValue(reply("openai", JSON.stringify({ content: "Bug fixes" })))

    const result = await service.translate("verhub", {
      ...translate,
      fields: { title: "", content: "修了几个问题" },
    })

    expect(result.fields).toEqual({ content: "Bug fixes" })
    // 待译 JSON 里不该出现 title 这个键（说明文字里提到 title 是另一回事）。
    const userMessage = JSON.parse(fetchMock.mock.calls[0][1].body).messages[1].content
    expect(userMessage).not.toContain('"title"')
  })

  it("rejects input past the outbound character budget", async () => {
    const { service } = createService()

    await expect(
      service.translate("verhub", {
        ...translate,
        fields: { content: "字".repeat(MAX_TRANSLATION_INPUT_CHARS + 1) },
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects the request while translation is disabled or unconfigured", async () => {
    const { service } = createService({ config: null })

    await expect(service.translate("verhub", translate)).rejects.toBeInstanceOf(BadRequestException)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  describe("test", () => {
    it("reports the sample translation on success", async () => {
      const { service } = createService()
      fetchMock.mockResolvedValue(
        reply("openai", JSON.stringify({ content: "This update fixes a few issues." })),
      )

      const result = await service.test()

      expect(result.ok).toBe(true)
      expect(result.sample).toBe("This update fixes a few issues.")
      expect(result.error).toBeNull()
    })

    it("reports the reason instead of throwing when the upstream fails", async () => {
      const { service } = createService()
      fetchMock.mockResolvedValue(failure(404, "model not found"))

      const result = await service.test()

      expect(result.ok).toBe(false)
      expect(result.sample).toBeNull()
      expect(result.error).toContain("404")
    })

    it("reports the reason when nothing is configured", async () => {
      const { service } = createService({ config: null })

      const result = await service.test()

      expect(result.ok).toBe(false)
      expect(result.error).toBeTruthy()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
