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

  it("getStatistics returns all level counts", async () => {
    const prisma = createPrismaMock()
    prisma.log.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(10) // debug
      .mockResolvedValueOnce(40) // info
      .mockResolvedValueOnce(30) // warning
      .mockResolvedValueOnce(20) // error

    const service = new LogsService(prisma as never)
    const stats = await service.getStatistics()

    expect(stats).toEqual({
      count: 100,
      debug_count: 10,
      info_count: 40,
      warning_count: 30,
      error_count: 20,
    })
  })

  it("findAll returns paginated logs", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          id: "log-1",
          level: "INFO",
          content: "test",
          deviceInfo: null,
          customData: null,
          createdAt: 1000,
        },
      ],
    ])

    const service = new LogsService(prisma as never)
    const result = await service.findAll("proj", { limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.data[0].level).toBe(1)
  })

  it("findAll throws when project not found", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new LogsService(prisma as never)
    await expect(service.findAll("missing", { limit: 10, offset: 0 })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("findAll with level filter", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValue([0, []])

    const service = new LogsService(prisma as never)
    await service.findAll("proj", { limit: 10, offset: 0, level: 3 })

    expect(prisma.log.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ level: "ERROR" }),
      }),
    )
  })

  it("createByProjectKey throws for invalid log level", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })

    const service = new LogsService(prisma as never)
    await expect(
      service.createByProjectKey("proj", { level: 99, content: "bad" }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("getStatus returns module info", () => {
    const prisma = createPrismaMock()
    const service = new LogsService(prisma as never)
    expect(service.getStatus()).toEqual({ module: "logs", implemented: true })
  })
})
