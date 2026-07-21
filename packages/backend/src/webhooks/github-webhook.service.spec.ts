import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common"

import { computeGithubSignature } from "./github-signature"
import { GithubWebhookService } from "./github-webhook.service"

const SECRET = "whsec_test_secret_value"

function createPrismaMock() {
  return {
    project: { findUnique: jest.fn() },
    version: { findFirst: jest.fn() },
  }
}

function createVersionsMock() {
  return {
    upsertByVersion: jest.fn().mockResolvedValue({
      item: { id: "version-1", version: "1.4.0" },
      created: true,
    }),
  }
}

function createService(overrides?: { secret?: string | null }) {
  const prisma = createPrismaMock()
  const versionsService = createVersionsMock()

  prisma.project.findUnique.mockResolvedValue({
    projectKey: "verhub",
    githubWebhookSecret: overrides?.secret === undefined ? SECRET : overrides.secret,
  })
  prisma.version.findFirst.mockResolvedValue(null)

  const service = new GithubWebhookService(prisma as never, versionsService as never)

  return { service, prisma, versionsService }
}

/** Build a signed delivery the way GitHub would. */
function delivery(body: unknown, options?: { event?: string; secret?: string }) {
  const raw = Buffer.from(JSON.stringify(body))

  return {
    projectKey: "verhub",
    event: options?.event ?? "release",
    signature: computeGithubSignature(options?.secret ?? SECRET, raw),
    deliveryId: "delivery-1",
    rawBody: raw,
    body,
  }
}

const RELEASE_EVENT = {
  action: "published",
  release: {
    tag_name: "v1.4.0",
    name: "Verhub 1.4.0",
    body: "release note",
    draft: false,
    prerelease: false,
    published_at: "2026-07-21T10:00:00.000Z",
    html_url: "https://github.com/example/verhub/releases/tag/v1.4.0",
    zipball_url: "https://api.github.com/repos/example/verhub/zipball/v1.4.0",
    assets: [
      {
        name: "verhub-win.zip",
        browser_download_url: "https://example.com/verhub-1.4.0-win.zip",
      },
    ],
  },
  repository: { full_name: "example/verhub" },
}

describe("GithubWebhookService", () => {
  it("syncs a published release from the pushed payload without calling GitHub", async () => {
    const fetchSpy = jest.spyOn(global, "fetch" as never)
    const { service, versionsService } = createService()

    const result = await service.handleDelivery(delivery(RELEASE_EVENT))

    expect(result).toEqual({
      status: "synced",
      event: "release",
      action: "published",
      version: "1.4.0",
      created: true,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(versionsService.upsertByVersion).toHaveBeenCalledWith(
      "verhub",
      "1.4.0",
      expect.objectContaining({
        version: "1.4.0",
        comparable_version: "1.4.0",
        title: "Verhub 1.4.0",
        content: "release note",
        download_url: "https://example.com/verhub-1.4.0-win.zip",
        is_latest: true,
        is_preview: false,
        published_at: 1784628000,
      }),
    )

    fetchSpy.mockRestore()
  })

  it("falls back to the zipball url when the release carries no assets", async () => {
    const { service, versionsService } = createService()

    await service.handleDelivery(
      delivery({ ...RELEASE_EVENT, release: { ...RELEASE_EVENT.release, assets: [] } }),
    )

    expect(versionsService.upsertByVersion).toHaveBeenCalledWith(
      "verhub",
      "1.4.0",
      expect.objectContaining({
        download_url: "https://api.github.com/repos/example/verhub/zipball/v1.4.0",
      }),
    )
  })

  it("never lets a prerelease claim is_latest", async () => {
    const { service, versionsService } = createService()

    await service.handleDelivery(
      delivery({
        action: "prereleased",
        release: { ...RELEASE_EVENT.release, tag_name: "v1.5.0-rc.1", prerelease: true },
      }),
    )

    expect(versionsService.upsertByVersion).toHaveBeenCalledWith(
      "verhub",
      "1.5.0-rc.1",
      expect.objectContaining({ is_latest: false, is_preview: true }),
    )
  })

  it("does not demote the current latest when an older release is edited", async () => {
    const { service, prisma, versionsService } = createService()
    prisma.version.findFirst.mockResolvedValue({ version: "2.0.0", comparableVersion: "2.0.0" })

    await service.handleDelivery(
      delivery({
        action: "edited",
        release: { ...RELEASE_EVENT.release, tag_name: "v1.4.0" },
      }),
    )

    expect(versionsService.upsertByVersion).toHaveBeenCalledWith(
      "verhub",
      "1.4.0",
      expect.objectContaining({ is_latest: false }),
    )
  })

  it("keeps is_latest when the current latest is re-synced", async () => {
    const { service, prisma, versionsService } = createService()
    prisma.version.findFirst.mockResolvedValue({ version: "1.4.0", comparableVersion: "1.4.0" })

    await service.handleDelivery(delivery({ ...RELEASE_EVENT, action: "edited" }))

    expect(versionsService.upsertByVersion).toHaveBeenCalledWith(
      "verhub",
      "1.4.0",
      expect.objectContaining({ is_latest: true }),
    )
  })

  it("truncates a release body past the length the version DTO accepts", async () => {
    const { service, versionsService } = createService()

    await service.handleDelivery(
      delivery({
        ...RELEASE_EVENT,
        release: { ...RELEASE_EVENT.release, body: "x".repeat(5000) },
      }),
    )

    const [, , dto] = versionsService.upsertByVersion.mock.calls[0]
    expect(dto.content).toHaveLength(4096)
    expect(dto.content.endsWith("…")).toBe(true)
  })

  it.each([
    [
      "draft releases",
      { ...RELEASE_EVENT, release: { ...RELEASE_EVENT.release, draft: true } },
      "draft_release",
    ],
    ["deleted releases", { ...RELEASE_EVENT, action: "deleted" }, "unsupported_action"],
    [
      "tags with no comparable ordering",
      { ...RELEASE_EVENT, release: { ...RELEASE_EVENT.release, tag_name: "nightly" } },
      "unparsable_version",
    ],
  ])("ignores %s", async (_label, payload, reason) => {
    const { service, versionsService } = createService()

    const result = await service.handleDelivery(delivery(payload))

    expect(result.status).toBe("ignored")
    expect(result.reason).toBe(reason)
    expect(versionsService.upsertByVersion).not.toHaveBeenCalled()
  })

  it("answers a ping without touching versions", async () => {
    const { service, versionsService } = createService()

    const result = await service.handleDelivery(delivery({ zen: "ok" }, { event: "ping" }))

    expect(result).toEqual({ status: "pong", event: "ping" })
    expect(versionsService.upsertByVersion).not.toHaveBeenCalled()
  })

  it("ignores events other than release", async () => {
    const { service } = createService()

    const result = await service.handleDelivery(delivery({ ref: "main" }, { event: "push" }))

    expect(result).toEqual({ status: "ignored", reason: "unsupported_event", event: "push" })
  })

  it("rejects a delivery signed with the wrong secret", async () => {
    const { service, versionsService } = createService()

    await expect(
      service.handleDelivery(delivery(RELEASE_EVENT, { secret: "wrong-secret" })),
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(versionsService.upsertByVersion).not.toHaveBeenCalled()
  })

  it("rejects a delivery whose raw body was not captured", async () => {
    const { service } = createService()

    await expect(
      service.handleDelivery({ ...delivery(RELEASE_EVENT), rawBody: undefined }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it("rejects every delivery for a project with no secret configured", async () => {
    const { service } = createService({ secret: null })

    await expect(service.handleDelivery(delivery(RELEASE_EVENT))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it("rejects a delivery for an unknown project", async () => {
    const { service, prisma } = createService()
    prisma.project.findUnique.mockResolvedValue(null)

    await expect(service.handleDelivery(delivery(RELEASE_EVENT))).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
