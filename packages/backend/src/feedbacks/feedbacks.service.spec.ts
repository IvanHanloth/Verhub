import { NotFoundException } from "@nestjs/common"

import { FeedbacksService } from "./feedbacks.service"

function createPrismaMock() {
  return {
    project: {
      findUnique: jest.fn(),
    },
    feedback: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  }
}

describe("FeedbacksService", () => {
  it("creates feedback from project key", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "verhub" })
    prisma.feedback.create.mockResolvedValue({
      id: "feedback-1",
      userId: "user-1",
      rating: 5,
      content: "great release",
      platform: "WEB",
      customData: { channel: "web" },
      createdAt: 1767225600,
    })

    const service = new FeedbacksService(prisma as never)
    const result = await service.createByProjectKey("verhub", {
      user_id: "user-1",
      rating: 5,
      content: "great release",
      platform: "web",
      custom_data: { channel: "web" },
    })

    expect(result.id).toBe("feedback-1")
    expect(result.platform).toBe("web")
    expect(result.created_at).toBe(1767225600)
  })

  it("throws when project key does not exist", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new FeedbacksService(prisma as never)

    await expect(
      service.createByProjectKey("unknown", {
        content: "feedback",
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it("getStatistics returns count, rate_count, rate_avg", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.count.mockResolvedValue(10)
    prisma.feedback.findMany.mockResolvedValue([{ rating: 4 }, { rating: 5 }, { rating: 3 }])

    const service = new FeedbacksService(prisma as never)
    const stats = await service.getStatistics()

    expect(stats.count).toBe(10)
    expect(stats.rate_count).toBe(3)
    expect(stats.rate_avg).toBe(4)
  })

  it("getStatistics returns null avg when no ratings", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.count.mockResolvedValue(5)
    prisma.feedback.findMany.mockResolvedValue([])

    const service = new FeedbacksService(prisma as never)
    const stats = await service.getStatistics()

    expect(stats.rate_avg).toBeNull()
    expect(stats.rate_count).toBe(0)
  })

  it("findAll lists feedbacks for a project", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          id: "f1",
          userId: "u1",
          rating: 5,
          content: "nice",
          platform: "WEB",
          customData: null,
          createdAt: 1000,
        },
      ],
    ])

    const service = new FeedbacksService(prisma as never)
    const result = await service.findAll("proj", { limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.data[0].platform).toBe("web")
  })

  it("findAll throws when project does not exist", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new FeedbacksService(prisma as never)
    await expect(service.findAll("missing", { limit: 10, offset: 0 })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("findOne returns a single feedback", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findFirst.mockResolvedValue({
      id: "f1",
      userId: null,
      rating: 3,
      content: "ok",
      platform: null,
      customData: null,
      createdAt: 2000,
    })

    const service = new FeedbacksService(prisma as never)
    const result = await service.findOne("proj", "f1")

    expect(result.id).toBe("f1")
    expect(result.platform).toBeNull()
  })

  it("findOne throws when feedback not found", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findFirst.mockResolvedValue(null)

    const service = new FeedbacksService(prisma as never)
    await expect(service.findOne("proj", "missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("update modifies a feedback", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findFirst.mockResolvedValue({ id: "f1", projectKey: "proj" })
    prisma.feedback.update.mockResolvedValue({
      id: "f1",
      userId: null,
      rating: 4,
      content: "updated",
      platform: "IOS",
      customData: null,
      createdAt: 2000,
    })

    const service = new FeedbacksService(prisma as never)
    const result = await service.update("proj", "f1", {
      content: "updated",
      rating: 4,
      platform: "ios",
    })

    expect(result.content).toBe("updated")
    expect(result.platform).toBe("ios")
  })

  it("update throws when feedback not found", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findFirst.mockResolvedValue(null)

    const service = new FeedbacksService(prisma as never)
    await expect(service.update("proj", "missing", { content: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("remove deletes a feedback", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findFirst.mockResolvedValue({ id: "f1" })
    prisma.feedback.delete.mockResolvedValue({})

    const service = new FeedbacksService(prisma as never)
    await service.remove("proj", "f1")

    expect(prisma.feedback.delete).toHaveBeenCalledWith({ where: { id: "f1" } })
  })

  it("remove throws when feedback not found", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findFirst.mockResolvedValue(null)

    const service = new FeedbacksService(prisma as never)
    await expect(service.remove("proj", "missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("updateById delegates to update", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.feedback.findFirst.mockResolvedValue({ id: "f1", projectKey: "proj" })
    prisma.feedback.update.mockResolvedValue({
      id: "f1",
      userId: null,
      rating: null,
      content: "changed",
      platform: null,
      customData: null,
      createdAt: 3000,
    })

    const service = new FeedbacksService(prisma as never)
    const result = await service.updateById("f1", { content: "changed" })

    expect(result.content).toBe("changed")
  })

  it("updateById throws when id not found", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findUnique.mockResolvedValue(null)

    const service = new FeedbacksService(prisma as never)
    await expect(service.updateById("missing", { content: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("removeById delegates to remove", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.feedback.findFirst.mockResolvedValue({ id: "f1" })
    prisma.feedback.delete.mockResolvedValue({})

    const service = new FeedbacksService(prisma as never)
    await service.removeById("f1")

    expect(prisma.feedback.delete).toHaveBeenCalledWith({ where: { id: "f1" } })
  })

  it("removeById throws when id not found", async () => {
    const prisma = createPrismaMock()
    prisma.feedback.findUnique.mockResolvedValue(null)

    const service = new FeedbacksService(prisma as never)
    await expect(service.removeById("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("getStatus returns module info", () => {
    const prisma = createPrismaMock()
    const service = new FeedbacksService(prisma as never)
    expect(service.getStatus()).toEqual({ module: "feedbacks", implemented: true })
  })
})
