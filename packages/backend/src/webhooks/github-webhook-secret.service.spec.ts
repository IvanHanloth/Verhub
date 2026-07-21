import { NotFoundException } from "@nestjs/common"

import { GithubWebhookSecretService } from "./github-webhook-secret.service"

function createPrismaMock() {
  return {
    project: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  }
}

function createService(existing?: { secret: string | null; updatedAt: number | null }) {
  const prisma = createPrismaMock()
  prisma.project.findUnique.mockResolvedValue({
    projectKey: "verhub",
    githubWebhookSecret: existing?.secret ?? null,
    githubWebhookSecretUpdatedAt: existing?.updatedAt ?? null,
  })
  prisma.project.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      projectKey: "verhub",
      githubWebhookSecret: data.githubWebhookSecret,
      githubWebhookSecretUpdatedAt: data.githubWebhookSecretUpdatedAt,
    }),
  )

  return { service: new GithubWebhookSecretService(prisma as never), prisma }
}

describe("GithubWebhookSecretService", () => {
  it("reveals the generated secret once and never again", async () => {
    const { service, prisma } = createService()

    const created = await service.regenerate("VerHub")
    expect(created.secret).toMatch(/^whsec_[0-9a-f]{48}$/)
    expect(created.enabled).toBe(true)
    expect(created.secret_hint).toBe(created.secret.slice(-4))
    expect(created.payload_path).toBe("/api/v1/webhooks/github/verhub")

    prisma.project.findUnique.mockResolvedValue({
      projectKey: "verhub",
      githubWebhookSecret: created.secret,
      githubWebhookSecretUpdatedAt: 1760000000,
    })

    const settings = await service.getSettings("verhub")
    expect(settings).not.toHaveProperty("secret")
    expect(settings.secret_hint).toBe(created.secret.slice(-4))
  })

  it("stores an operator-supplied secret with surrounding whitespace removed", async () => {
    const { service, prisma } = createService()

    const result = await service.setSecret("verhub", "  my-existing-github-secret  ")

    expect(result.secret).toBe("my-existing-github-secret")
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ githubWebhookSecret: "my-existing-github-secret" }),
      }),
    )
  })

  it("reports the webhook as disabled once the secret is cleared", async () => {
    const { service } = createService({ secret: "old-secret-value", updatedAt: 1760000000 })

    const result = await service.clearSecret("verhub")

    expect(result).toEqual({
      enabled: false,
      payload_path: "/api/v1/webhooks/github/verhub",
      content_type: "application/json",
      secret_hint: null,
      secret_updated_at: null,
    })
  })

  it("refuses to configure a project that does not exist", async () => {
    const { service, prisma } = createService()
    prisma.project.findUnique.mockResolvedValue(null)

    await expect(service.regenerate("missing")).rejects.toBeInstanceOf(NotFoundException)
  })
})
