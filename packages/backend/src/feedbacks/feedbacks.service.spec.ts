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
    prisma.project.findUnique.mockResolvedValue({ id: "project-1" })
    prisma.feedback.create.mockResolvedValue({
      id: "feedback-1",
      userId: "user-1",
      rating: 5,
      content: "great release",
      platform: "WEB",
      customData: { channel: "web" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
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
    expect(result.created_at).toBe("2026-01-01T00:00:00.000Z")
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
})
