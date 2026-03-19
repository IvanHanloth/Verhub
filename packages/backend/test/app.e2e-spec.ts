import { INestApplication } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { Test } from "@nestjs/testing"
import * as bcrypt from "bcrypt"
import request from "supertest"

import { AuthModule } from "../src/auth/auth.module"
import { DatabaseModule } from "../src/database/database.module"
import { PrismaService } from "../src/database/prisma.service"
import { HealthModule } from "../src/health/health.module"

describe("App (e2e)", () => {
  let app: INestApplication
  let adminPasswordHash = ""
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
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = "e2e-secret"
    process.env.JWT_EXPIRES_IN = "2h"
    process.env.ADMIN_PASSWORD = ""
    adminPasswordHash = await bcrypt.hash("admin123", 4)

    prismaMock.user.count.mockResolvedValue(1)

    const moduleFixture = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, HealthModule, AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix("api/v1")
    await app.init()
  })

  beforeEach(() => {
    prismaMock.user.count.mockReset()
    prismaMock.user.create.mockReset()
    prismaMock.user.findFirst.mockReset()
    prismaMock.user.findUnique.mockReset()
    prismaMock.apiKey.findFirst.mockReset()
    prismaMock.apiKey.update.mockReset()

    prismaMock.user.count.mockResolvedValue(1)
  })

  afterAll(async () => {
    if (app) {
      await app.close()
    }
  })

  it("GET /api/v1/health", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health").expect(200)

    expect(response.body.status).toBe("ok")
  })

  it("POST /api/v1/auth/login returns token for valid admin credentials", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "admin-id",
      username: "admin",
      role: "ADMIN",
      passwordHash: adminPasswordHash,
    })

    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      username: "admin",
      password: "admin123",
    })

    expect(response.status).toBe(201)
    expect(response.body.access_token).toEqual(expect.any(String))
    expect(response.body.expires_in).toBe(7200)
    expect(response.body.user).toEqual({
      id: "admin-id",
      username: "admin",
      role: "ADMIN",
      must_change_password: false,
    })
  })

  it("POST /api/v1/auth/login rejects invalid password", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "admin-id",
      username: "admin",
      role: "ADMIN",
      passwordHash: adminPasswordHash,
    })

    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      username: "admin",
      password: "wrong-password",
    })

    expect(response.status).toBe(401)
    expect(response.body.message).toBe("Invalid username or password")
  })
})
