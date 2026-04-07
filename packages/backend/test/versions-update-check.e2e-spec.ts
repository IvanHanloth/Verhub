import { INestApplication, ValidationPipe } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { DatabaseModule } from "../src/database/database.module"
import { PrismaService } from "../src/database/prisma.service"
import { VersionsModule } from "../src/versions/versions.module"

describe("Versions update check (e2e)", () => {
  let app: INestApplication

  const prismaMock = {
    user: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    apiKey: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
    version: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = "e2e-secret"
    process.env.JWT_EXPIRES_IN = "2h"
    process.env.ADMIN_PASSWORD = ""

    prismaMock.user.count.mockResolvedValue(1)

    const moduleFixture = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, VersionsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix("api/v1")
    app.useGlobalPipes(new ValidationPipe({ transform: true }))
    await app.init()
  })

  beforeEach(() => {
    prismaMock.user.count.mockReset()
    prismaMock.user.create.mockReset()
    prismaMock.user.findFirst.mockReset()
    prismaMock.user.findUnique.mockReset()
    prismaMock.apiKey.findFirst.mockReset()
    prismaMock.apiKey.update.mockReset()
    prismaMock.project.findUnique.mockReset()
    prismaMock.version.findFirst.mockReset()
    prismaMock.version.findMany.mockReset()

    prismaMock.user.count.mockResolvedValue(1)
  })

  afterAll(async () => {
    if (app) {
      await app.close()
    }
  })

  it("forces update when current version is deprecated even inside optional range", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      projectKey: "proj",
      optionalUpdateMinComparableVersion: "1.0.0",
      optionalUpdateMaxComparableVersion: "2.0.0",
    })
    prismaMock.version.findFirst
      .mockResolvedValueOnce({
        id: "latest-stable",
        projectKey: "proj",
        version: "1.6.0",
        comparableVersion: "1.6.0",
        title: null,
        content: null,
        downloadUrl: null,
        downloadLinks: null,
        forced: false,
        isLatest: true,
        isPreview: false,
        isMilestone: false,
        isDeprecated: false,
        platforms: [],
        platform: null,
        customData: null,
        publishedAt: 100,
        createdAt: 100,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "1.5.0",
        comparableVersion: "1.5.0",
        isMilestone: false,
        isDeprecated: true,
      })
    prismaMock.version.findMany.mockResolvedValue([])

    const response = await request(app.getHttpServer())
      .post("/api/v1/public/proj/versions/check-update")
      .send({ current_version: "1.5.0" })
      .expect(201)

    expect(response.body.should_update).toBe(true)
    expect(response.body.required).toBe(true)
    expect(response.body.reason_codes).toEqual(
      expect.arrayContaining(["newer_version_available", "current_version_deprecated"]),
    )
  })

  it("returns earliest milestone as target for optional updates", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      projectKey: "proj",
      optionalUpdateMinComparableVersion: "1.0.0",
      optionalUpdateMaxComparableVersion: "2.0.0",
    })
    prismaMock.version.findFirst
      .mockResolvedValueOnce({
        id: "latest-stable",
        projectKey: "proj",
        version: "2.0.0",
        comparableVersion: "2.0.0",
        title: null,
        content: null,
        downloadUrl: null,
        downloadLinks: null,
        forced: false,
        isLatest: true,
        isPreview: false,
        isMilestone: false,
        isDeprecated: false,
        platforms: [],
        platform: null,
        customData: null,
        publishedAt: 200,
        createdAt: 200,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        version: "1.5.0",
        comparableVersion: "1.5.0",
        isMilestone: false,
        isDeprecated: false,
      })
    prismaMock.version.findMany.mockResolvedValue([
      {
        id: "m1",
        projectKey: "proj",
        version: "1.8.0",
        comparableVersion: "1.8.0",
        title: null,
        content: null,
        downloadUrl: null,
        downloadLinks: null,
        forced: false,
        isLatest: false,
        isPreview: false,
        isMilestone: true,
        isDeprecated: false,
        platforms: [],
        platform: null,
        customData: null,
        publishedAt: 180,
        createdAt: 180,
      },
    ])

    const response = await request(app.getHttpServer())
      .post("/api/v1/public/proj/versions/check-update")
      .send({ current_version: "1.5.0" })
      .expect(201)

    expect(response.body.required).toBe(false)
    expect(response.body.reason_codes).toEqual(
      expect.arrayContaining(["newer_version_available", "milestone_guard"]),
    )
    expect(response.body.target_version.version).toBe("1.8.0")
  })
})
