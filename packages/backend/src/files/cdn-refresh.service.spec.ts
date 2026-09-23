import { sealSecret } from "../common/secret-box"
import { CdnRefreshService } from "./cdn-refresh.service"

function createService(record: Record<string, unknown> | null) {
  const prisma = { cdnConfig: { findUnique: jest.fn().mockResolvedValue(record) } }
  return new CdnRefreshService(prisma as never)
}

describe("CdnRefreshService", () => {
  const previousSecret = process.env.JWT_SECRET
  const previousBase = process.env.VERHUB_DIST_BASE_URL

  beforeAll(() => {
    process.env.JWT_SECRET = "test-jwt-secret"
  })

  afterAll(() => {
    process.env.JWT_SECRET = previousSecret
    process.env.VERHUB_DIST_BASE_URL = previousBase
  })

  function enabledRecord() {
    return {
      enabled: true,
      provider: "aliyun",
      accessKeyId: "id",
      accessKeySecretEncrypted: sealSecret("secret", "cdn-aliyun-access-key-secret"),
      accessKeySecretFingerprint: "fp",
      updatedAt: 1,
    }
  }

  it("skips refreshing when disabled or without a distribution base", async () => {
    process.env.VERHUB_DIST_BASE_URL = "https://cdn.example.com"
    expect(
      await createService({ ...enabledRecord(), enabled: false }).refreshObjects(["f/a/b/c"]),
    ).toBeNull()
    expect(await createService(null).refreshObjects(["f/a/b/c"])).toBeNull()

    delete process.env.VERHUB_DIST_BASE_URL
    expect(await createService(enabledRecord()).refreshObjects(["f/a/b/c"])).toBeNull()
  })

  it("refreshes encoded distribution urls", async () => {
    process.env.VERHUB_DIST_BASE_URL = "https://cdn.example.com"
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ RefreshTaskId: "42" }), { status: 200 }))
    try {
      const result = await createService(enabledRecord()).refreshObjects(["f/app/abc/安装 包.exe"])
      expect(result).toEqual({
        ok: true,
        urls: ["https://cdn.example.com/f/app/abc/%E5%AE%89%E8%A3%85%20%E5%8C%85.exe"],
        task_ids: ["42"],
        error: null,
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("reports api failures without throwing", async () => {
    process.env.VERHUB_DIST_BASE_URL = "https://cdn.example.com"
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ Code: "Forbidden.RAM", Message: "no permission" }), {
        status: 403,
      }),
    )
    try {
      const result = await createService(enabledRecord()).refreshObjects(["f/a/b/c.zip"])
      expect(result?.ok).toBe(false)
      expect(result?.error).toContain("Forbidden.RAM")
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
