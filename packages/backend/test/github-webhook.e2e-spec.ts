/**
 * End-to-end check for the GitHub release webhook.
 *
 * The point of going through a real HTTP request is `rawBody`: the signature is
 * computed over the exact delivered bytes, and only a real request proves the
 * body parser kept them. A unit test hands the service a Buffer it made itself
 * and would pass even if the app were never configured with `rawBody: true`.
 */

import { createHmac } from "node:crypto"

import { INestApplication, ValidationPipe } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { DatabaseModule } from "../src/database/database.module"
import { PrismaService } from "../src/database/prisma.service"
import { WebhooksModule } from "../src/webhooks/webhooks.module"

const SECRET = "whsec_e2e_secret_value"
const PROJECT = {
  projectKey: "verhub",
  githubWebhookSecret: SECRET,
  githubWebhookSecretUpdatedAt: 1760000000,
}

const RELEASE_EVENT = {
  action: "published",
  release: {
    tag_name: "v2.1.0",
    name: "Verhub 2.1.0",
    body: "webhook sync",
    draft: false,
    prerelease: false,
    published_at: "2026-07-21T10:00:00.000Z",
    html_url: "https://github.com/example/verhub/releases/tag/v2.1.0",
    assets: [{ name: "app.zip", browser_download_url: "https://example.com/verhub-2.1.0.zip" }],
  },
  repository: { full_name: "example/verhub" },
}

describe("GitHub webhook (e2e)", () => {
  let app: INestApplication
  const prismaMock = {
    // WebhooksModule pulls in AuthModule, whose bootstrap hook counts admins.
    user: { count: jest.fn() },
    project: { findUnique: jest.fn(), update: jest.fn() },
    version: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = "e2e-secret"
    prismaMock.user.count.mockResolvedValue(1)

    const moduleFixture = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, WebhooksModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile()

    app = moduleFixture.createNestApplication({ rawBody: true })
    app.setGlobalPrefix("api/v1")
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  })

  beforeEach(() => {
    jest.resetAllMocks()

    prismaMock.project.findUnique.mockResolvedValue(PROJECT)
    prismaMock.version.findUnique.mockResolvedValue(null)
    prismaMock.version.findFirst.mockResolvedValue(null)
    prismaMock.version.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.version.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: "version-e2e",
        ...data,
        platforms: [],
        platform: null,
        createdAt: 1784628000,
      }),
    )
  })

  afterAll(async () => {
    if (app) {
      await app.close()
    }
  })

  /** Sign exactly the bytes that will go on the wire. */
  function send(body: unknown, options?: { event?: string; secret?: string }) {
    const raw = JSON.stringify(body)
    const signature = `sha256=${createHmac("sha256", options?.secret ?? SECRET)
      .update(raw)
      .digest("hex")}`

    return request(app.getHttpServer())
      .post("/api/v1/webhooks/github/verhub")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", options?.event ?? "release")
      .set("X-GitHub-Delivery", "e2e-delivery")
      .set("X-Hub-Signature-256", signature)
      .send(raw)
  }

  it("writes the version carried by a correctly signed delivery", async () => {
    const response = await send(RELEASE_EVENT).expect(200)

    expect(response.body).toEqual({
      status: "synced",
      event: "release",
      action: "published",
      version: "2.1.0",
      created: true,
    })
    expect(prismaMock.version.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectKey: "verhub",
          version: "2.1.0",
          comparableVersion: "2.1.0",
          title: "Verhub 2.1.0",
          content: "webhook sync",
          downloadUrl: "https://example.com/verhub-2.1.0.zip",
          isLatest: true,
          isPreview: false,
        }),
      }),
    )
  })

  it("rejects a delivery signed with the wrong secret", async () => {
    await send(RELEASE_EVENT, { secret: "not-the-secret" }).expect(401)

    expect(prismaMock.version.create).not.toHaveBeenCalled()
  })

  it("rejects a delivery with no signature header at all", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/webhooks/github/verhub")
      .set("X-GitHub-Event", "release")
      .send(RELEASE_EVENT)
      .expect(401)

    expect(prismaMock.version.create).not.toHaveBeenCalled()
  })

  it("refuses every delivery while the project has no secret", async () => {
    prismaMock.project.findUnique.mockResolvedValue({ ...PROJECT, githubWebhookSecret: null })

    await send(RELEASE_EVENT).expect(403)
  })

  it("answers GitHub's ping so the webhook can be verified from the repository", async () => {
    const response = await send({ zen: "Keep it logically awesome." }, { event: "ping" }).expect(
      200,
    )

    expect(response.body).toEqual({ status: "pong", event: "ping" })
  })
})
