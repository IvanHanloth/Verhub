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
})
