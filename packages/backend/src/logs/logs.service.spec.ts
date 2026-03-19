import { BadRequestException, NotFoundException } from "@nestjs/common"

import { LogsService } from "./logs.service"

function createPrismaMock() {
  return {
    project: {
      findUnique: jest.fn(),
    },
    log: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  }
}

describe("LogsService", () => {
  it("creates log from public endpoint", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ id: "project-1" })
    prisma.log.create.mockResolvedValue({
      id: "log-1",
      level: "ERROR",
      content: "fatal issue",
      deviceInfo: { os: "windows" },
      customData: { build: "1.0.0" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    })

    const service = new LogsService(prisma as never)
    const result = await service.createByProjectKey("verhub", {
      level: 3,
      content: "fatal issue",
      device_info: { os: "windows" },
      custom_data: { build: "1.0.0" },
    })

    expect(result.id).toBe("log-1")
    expect(result.level).toBe(3)
  })

  it("throws bad request when time range is invalid", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ id: "project-1" })

    const service = new LogsService(prisma as never)

    await expect(
      service.findAll("project-1", {
        limit: 20,
        offset: 0,
        start_time: 200,
        end_time: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("throws when project key does not exist", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new LogsService(prisma as never)

    await expect(
      service.createByProjectKey("unknown", {
        level: 1,
        content: "hello",
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
