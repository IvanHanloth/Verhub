import { BadRequestException } from "@nestjs/common"

import { GithubAppConfigService } from "./github-app-config.service"

const PEM = "-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----"

function createPrismaMock() {
  return {
    githubAppConfig: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create, update }) => ({
        id: "default",
        appId: null,
        privateKeyEncrypted: null,
        privateKeyFingerprint: null,
        privateKeyUpdatedAt: null,
        webhookSecret: null,
        webhookSecretUpdatedAt: null,
        enabledFeatures: [],
        feedbackIssueTitleTemplate: null,
        feedbackIssueBodyTemplate: null,
        updatedAt: 1,
        ...create,
        ...update,
      })),
    },
  }
}

describe("GithubAppConfigService", () => {
  const originalSecret = process.env.JWT_SECRET

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret"
  })

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret
  })

  it("stores the private key encrypted and never echoes it", async () => {
    const prisma = createPrismaMock()
    const service = new GithubAppConfigService(prisma as never)

    const view = await service.update({ app_id: "12345", private_key: PEM })

    const upsert = prisma.githubAppConfig.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>
    }
    expect(upsert.update.privateKeyEncrypted).toEqual(expect.stringMatching(/^v1:/))
    expect(upsert.update.privateKeyEncrypted).not.toContain("PRIVATE KEY")
    expect(JSON.stringify(view)).not.toContain("PRIVATE KEY")
    expect(view.has_private_key).toBe(true)
    expect(view.configured).toBe(true)
  })

  it("rejects a non-PEM private key", async () => {
    const service = new GithubAppConfigService(createPrismaMock() as never)
    await expect(service.update({ private_key: "not a pem" })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it("rejects unknown features", async () => {
    const service = new GithubAppConfigService(createPrismaMock() as never)
    await expect(
      service.update({ enabled_features: ["nonexistent" as never] }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("empty private_key clears the stored key", async () => {
    const prisma = createPrismaMock()
    const service = new GithubAppConfigService(prisma as never)
    const view = await service.update({ private_key: "" })
    expect(view.has_private_key).toBe(false)
    expect(view.configured).toBe(false)
  })

  it("round-trips the private key through getPrivateKey", async () => {
    const prisma = createPrismaMock()
    const service = new GithubAppConfigService(prisma as never)
    await service.update({ private_key: PEM })
    const stored = (
      prisma.githubAppConfig.upsert.mock.calls[0]?.[0] as { update: Record<string, unknown> }
    ).update

    prisma.githubAppConfig.findUnique.mockResolvedValue({
      privateKeyEncrypted: stored.privateKeyEncrypted,
    })
    await expect(service.getPrivateKey()).resolves.toBe(PEM)
  })

  it("feature is enabled only with credentials plus the flag", async () => {
    const prisma = createPrismaMock()
    const service = new GithubAppConfigService(prisma as never)

    prisma.githubAppConfig.findUnique.mockResolvedValue({
      appId: "1",
      privateKeyEncrypted: "v1:x:y:z",
      enabledFeatures: ["feedback_issue"],
    })
    await expect(service.isFeatureEnabled("feedback_issue")).resolves.toBe(true)
    await expect(service.isFeatureEnabled("comment_commands")).resolves.toBe(false)

    // 凭据不全时即便勾了功能也不算启用
    prisma.githubAppConfig.findUnique.mockResolvedValue({
      appId: null,
      privateKeyEncrypted: null,
      enabledFeatures: ["feedback_issue"],
    })
    await expect(service.isFeatureEnabled("feedback_issue")).resolves.toBe(false)
  })

  it("clear wipes everything", async () => {
    const prisma = createPrismaMock()
    const service = new GithubAppConfigService(prisma as never)
    const view = await service.clear()
    expect(view.configured).toBe(false)
    expect(view.enabled_features).toEqual([])
  })
})
