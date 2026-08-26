import { TranslationConfigService } from "./translation-config.service"
import { BUILTIN_TRANSLATION_SYSTEM_PROMPT } from "./translation-prompt"

const API_KEY = "sk-test-1234567890"

const DEFAULTS = {
  id: "default",
  enabled: false,
  provider: "openai",
  baseUrl: null,
  apiKeyEncrypted: null,
  apiKeyFingerprint: null,
  apiKeyUpdatedAt: null,
  model: null,
  customPrompt: false,
  systemPrompt: null,
  updatedAt: 1,
}

function createPrismaMock(existing: Record<string, unknown> | null = null) {
  return {
    translationConfig: {
      findUnique: jest.fn().mockResolvedValue(existing),
      upsert: jest
        .fn()
        .mockImplementation(({ create, update }) => ({ ...DEFAULTS, ...create, ...update })),
    },
  }
}

describe("TranslationConfigService", () => {
  const originalSecret = process.env.JWT_SECRET

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret"
  })

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret
  })

  it("stores the api key encrypted and never echoes it", async () => {
    const prisma = createPrismaMock()
    const service = new TranslationConfigService(prisma as never)

    const view = await service.update({
      base_url: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      api_key: API_KEY,
    })

    const upsert = prisma.translationConfig.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>
    }
    expect(upsert.update.apiKeyEncrypted).toEqual(expect.stringMatching(/^v1:/))
    expect(upsert.update.apiKeyEncrypted).not.toContain(API_KEY)
    expect(JSON.stringify(view)).not.toContain(API_KEY)
    expect(view.has_api_key).toBe(true)
    expect(view.api_key_fingerprint).toEqual(expect.any(String))
  })

  it("clears the api key when an empty string is submitted", async () => {
    const prisma = createPrismaMock()
    const service = new TranslationConfigService(prisma as never)

    await service.update({ api_key: "" })

    const upsert = prisma.translationConfig.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>
    }
    expect(upsert.update.apiKeyEncrypted).toBeNull()
    expect(upsert.update.apiKeyFingerprint).toBeNull()
    expect(upsert.update.apiKeyUpdatedAt).toBeNull()
  })

  it("treats base url plus model as configured, with no api key required", async () => {
    const service = new TranslationConfigService(
      createPrismaMock({
        ...DEFAULTS,
        baseUrl: "http://localhost:11434/v1",
        model: "qwen2.5",
      }) as never,
    )

    const view = await service.getView()

    expect(view.configured).toBe(true)
    expect(view.has_api_key).toBe(false)
  })

  it("is not configured while either base url or model is missing", async () => {
    const service = new TranslationConfigService(
      createPrismaMock({ ...DEFAULTS, baseUrl: "https://api.openai.com/v1" }) as never,
    )

    expect((await service.getView()).configured).toBe(false)
  })

  it("echoes the full request url so the admin can check the base url", async () => {
    const openai = new TranslationConfigService(
      createPrismaMock({ ...DEFAULTS, baseUrl: "https://api.openai.com/v1/" }) as never,
    )
    const anthropic = new TranslationConfigService(
      createPrismaMock({
        ...DEFAULTS,
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
      }) as never,
    )

    expect((await openai.getView()).request_url).toBe("https://api.openai.com/v1/chat/completions")
    expect((await anthropic.getView()).request_url).toBe("https://api.anthropic.com/v1/messages")
  })

  it("falls back to the builtin prompt while the custom switch is off", async () => {
    const service = new TranslationConfigService(
      createPrismaMock({
        ...DEFAULTS,
        enabled: true,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        customPrompt: false,
        systemPrompt: "只翻译标题",
      }) as never,
    )

    const resolved = await service.resolve()

    expect(resolved?.systemPrompt).toBe(BUILTIN_TRANSLATION_SYSTEM_PROMPT)
  })

  it("uses the custom prompt once the switch is on", async () => {
    const service = new TranslationConfigService(
      createPrismaMock({
        ...DEFAULTS,
        enabled: true,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        customPrompt: true,
        systemPrompt: "只翻译标题",
      }) as never,
    )

    expect((await service.resolve())?.systemPrompt).toBe("只翻译标题")
  })

  it("resolves the stored api key back to plaintext", async () => {
    const prisma = createPrismaMock()
    const service = new TranslationConfigService(prisma as never)
    await service.update({ api_key: API_KEY })
    const sealed = (
      prisma.translationConfig.upsert.mock.calls[0]?.[0] as { update: Record<string, unknown> }
    ).update.apiKeyEncrypted

    prisma.translationConfig.findUnique.mockResolvedValue({
      ...DEFAULTS,
      enabled: true,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiKeyEncrypted: sealed,
    })

    expect((await service.resolve())?.apiKey).toBe(API_KEY)
  })

  it("resolves to null while the master switch is off", async () => {
    const service = new TranslationConfigService(
      createPrismaMock({
        ...DEFAULTS,
        enabled: false,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
      }) as never,
    )

    expect(await service.resolve()).toBeNull()
  })

  it("clearing turns the master switch off and drops the credentials", async () => {
    const prisma = createPrismaMock()
    const service = new TranslationConfigService(prisma as never)

    const view = await service.clear()

    expect(view.enabled).toBe(false)
    expect(view.configured).toBe(false)
    expect(view.has_api_key).toBe(false)
    expect(view.base_url).toBeNull()
  })
})
