import { NotFoundException } from "@nestjs/common"

import { AnnouncementsService } from "./announcements.service"

function createPrismaMock() {
  return {
    project: {
      findUnique: jest.fn(),
    },
    announcement: {
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

describe("AnnouncementsService", () => {
  it("maps author and published_at when creating announcement", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.announcement.create.mockResolvedValue({
      id: "announcement-1",
      title: "发布说明",
      content: "更新内容",
      isPinned: true,
      author: "运营团队",
      publishedAt: 1774080000000,
      createdAt: 1774076400000,
      updatedAt: 1774078200000,
    })

    const service = new AnnouncementsService(prisma as never)
    const publishedAt = new Date("2026-03-21T08:00:00.000Z").getTime()
    const result = await service.create("project-1", {
      title: "发布说明",
      content: "更新内容",
      is_pinned: true,
      author: "运营团队",
      published_at: publishedAt,
    })

    expect(prisma.announcement.create).toHaveBeenCalledWith({
      data: {
        projectKey: "project-1",
        title: "发布说明",
        content: "更新内容",
        isPinned: true,
        author: "运营团队",
        publishedAt,
      },
    })

    expect(result.author).toBe("运营团队")
    expect(result.published_at).toBe(publishedAt)
  })

  it("throws when announcement is missing", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findFirst.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never)

    await expect(service.findOne("project-1", "missing")).rejects.toBeInstanceOf(NotFoundException)
  })
})
