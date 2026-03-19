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
  const prismaMock = {
    user: {
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
    process.env.ADMIN_USERNAME = "admin"
    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash("admin123", 4)

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
    prismaMock.user.findUnique.mockReset()
    prismaMock.apiKey.findFirst.mockReset()
    prismaMock.apiKey.update.mockReset()
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
    prismaMock.user.findUnique.mockResolvedValue(null)

    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      username: "admin",
      password: "admin123",
    })

    expect(response.status).toBe(201)
    expect(response.body.access_token).toEqual(expect.any(String))
    expect(response.body.expires_in).toBe(7200)
  })

  it("POST /api/v1/auth/login rejects invalid password", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)

    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      username: "admin",
      password: "wrong-password",
    })

    expect(response.status).toBe(401)
    expect(response.body.message).toBe("Invalid username or password")
  })
})
