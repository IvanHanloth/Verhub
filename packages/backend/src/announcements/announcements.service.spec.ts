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
  it("maps author, hidden flag and platforms when creating announcement", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.announcement.create.mockResolvedValue({
      id: "announcement-1",
      title: "发布说明",
      content: "更新内容",
      isPinned: true,
      isHidden: true,
      platforms: ["IOS", "WEB"],
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
      is_hidden: true,
      platforms: ["ios", "web"],
      author: "运营团队",
      published_at: publishedAt,
    })

    expect(prisma.announcement.create).toHaveBeenCalledWith({
      data: {
        projectKey: "project-1",
        title: "发布说明",
        content: "更新内容",
        isPinned: true,
        isHidden: true,
        platforms: ["IOS", "WEB"],
        author: "运营团队",
        publishedAt,
      },
    })

    expect(result.author).toBe("运营团队")
    expect(result.published_at).toBe(publishedAt)
    expect(result.is_hidden).toBe(true)
    expect(result.platforms).toEqual(["ios", "web"])
  })

  it("excludes hidden announcements in public list and filters by platform", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          id: "announcement-1",
          title: "发布说明",
          content: "更新内容",
          isPinned: false,
          isHidden: false,
          platforms: ["WEB"],
          author: null,
          publishedAt: 1774080000,
          createdAt: 1774076400,
          updatedAt: 1774078200,
        },
      ],
    ])

    const service = new AnnouncementsService(prisma as never)
    await service.findAllByProjectKey("project-1", {
      limit: 20,
      offset: 0,
      platform: "web",
    })

    expect(prisma.announcement.count).toHaveBeenCalledWith({
      where: {
        projectKey: "project-1",
        isHidden: false,
        OR: [{ platforms: { isEmpty: true } }, { platforms: { has: "WEB" } }],
      },
    })
    expect(prisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectKey: "project-1",
          isHidden: false,
          OR: [{ platforms: { isEmpty: true } }, { platforms: { has: "WEB" } }],
        },
      }),
    )
  })

  it("latest public announcement should ignore hidden records", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.announcement.findFirst.mockResolvedValue({
      id: "announcement-1",
      title: "latest",
      content: "latest content",
      isPinned: false,
      isHidden: false,
      platforms: [],
      author: null,
      publishedAt: 1774080000,
      createdAt: 1774076400,
      updatedAt: 1774078200,
    })

    const service = new AnnouncementsService(prisma as never)
    await service.findLatestByProjectKey("project-1")

    expect(prisma.announcement.findFirst).toHaveBeenCalledWith({
      where: { projectKey: "project-1", isHidden: false },
      orderBy: { createdAt: "desc" },
    })
  })

  it("throws when announcement is missing", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findFirst.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never)

    await expect(service.findOne("project-1", "missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("getStatistics returns count and pinned_count", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.count.mockResolvedValueOnce(10).mockResolvedValueOnce(3)

    const service = new AnnouncementsService(prisma as never)
    const stats = await service.getStatistics()

    expect(stats.count).toBe(10)
    expect(stats.pinned_count).toBe(3)
  })

  it("findAll returns paginated announcements", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValue([
      2,
      [
        {
          id: "a1",
          title: "Title",
          content: "Content",
          isPinned: false,
          isHidden: false,
          platforms: [],
          author: null,
          publishedAt: 1000,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    ])

    const service = new AnnouncementsService(prisma as never)
    const result = await service.findAll("proj", { limit: 10, offset: 0 })

    expect(result.total).toBe(2)
    expect(result.data).toHaveLength(1)
  })

  it("findAll throws when project not found", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never)
    await expect(service.findAll("missing", { limit: 10, offset: 0 })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("findLatestByProjectKey throws when project not found", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never)
    await expect(service.findLatestByProjectKey("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("findLatestByProjectKey throws when no announcements", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.announcement.findFirst.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never)
    await expect(service.findLatestByProjectKey("proj")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("findLatestByProjectKey with platform filter", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.announcement.findFirst.mockResolvedValue({
      id: "a1",
      title: "t",
      content: "c",
      isPinned: false,
      isHidden: false,
      platforms: ["IOS"],
      author: null,
      publishedAt: 1000,
      createdAt: 1000,
      updatedAt: 1000,
    })

    const service = new AnnouncementsService(prisma as never)
    await service.findLatestByProjectKey("proj", { platform: "ios" })

    expect(prisma.announcement.findFirst).toHaveBeenCalledWith({
      where: {
        projectKey: "proj",
        isHidden: false,
        OR: [{ platforms: { isEmpty: true } }, { platforms: { has: "IOS" } }],
      },
      orderBy: { createdAt: "desc" },
    })
  })

  it("update modifies an announcement", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findFirst.mockResolvedValue({ id: "a1", projectKey: "proj" })
    prisma.announcement.update.mockResolvedValue({
      id: "a1",
      title: "Updated",
      content: "New content",
      isPinned: true,
      isHidden: false,
      platforms: [],
      author: null,
      publishedAt: 1000,
      createdAt: 1000,
      updatedAt: 2000,
    })

    const service = new AnnouncementsService(prisma as never)
    const result = await service.update("proj", "a1", { title: "Updated", is_pinned: true })

    expect(result.title).toBe("Updated")
    expect(result.is_pinned).toBe(true)
  })

  it("update throws when announcement not found", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findFirst.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never)
    await expect(service.update("proj", "missing", { title: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("remove deletes an announcement", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findFirst.mockResolvedValue({ id: "a1" })
    prisma.announcement.delete.mockResolvedValue({})

    const service = new AnnouncementsService(prisma as never)
    await service.remove("proj", "a1")

    expect(prisma.announcement.delete).toHaveBeenCalledWith({ where: { id: "a1" } })
  })

  it("remove throws when announcement not found", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findFirst.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never)
    await expect(service.remove("proj", "missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("updateById delegates to update", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.announcement.findFirst.mockResolvedValue({ id: "a1", projectKey: "proj" })
    prisma.announcement.update.mockResolvedValue({
      id: "a1",
      title: "Updated",
      content: "c",
      isPinned: false,
      isHidden: false,
      platforms: [],
      author: null,
      publishedAt: 1000,
      createdAt: 1000,
      updatedAt: 2000,
    })

    const service = new AnnouncementsService(prisma as never)
    const result = await service.updateById("a1", { title: "Updated" })

    expect(result.title).toBe("Updated")
  })

  it("updateById throws when id not found", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findUnique.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never)
    await expect(service.updateById("missing", { title: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("removeById delegates to remove", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.announcement.findFirst.mockResolvedValue({ id: "a1" })
    prisma.announcement.delete.mockResolvedValue({})

    const service = new AnnouncementsService(prisma as never)
    await service.removeById("a1")

    expect(prisma.announcement.delete).toHaveBeenCalledWith({ where: { id: "a1" } })
  })

  it("removeById throws when id not found", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findUnique.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never)
    await expect(service.removeById("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("getStatus returns module info", () => {
    const prisma = createPrismaMock()
    const service = new AnnouncementsService(prisma as never)
    expect(service.getStatus()).toEqual({ module: "announcements", implemented: true })
  })

  it("findAllByProjectKey without platform filter", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValue([0, []])

    const service = new AnnouncementsService(prisma as never)
    const result = await service.findAllByProjectKey("proj", { limit: 10, offset: 0 })

    expect(result.total).toBe(0)
    expect(prisma.announcement.count).toHaveBeenCalledWith({
      where: { projectKey: "proj", isHidden: false },
    })
  })

  it("createByProjectKey delegates to create", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.announcement.create.mockResolvedValue({
      id: "a1",
      title: "T",
      content: "C",
      isPinned: false,
      isHidden: false,
      platforms: [],
      author: null,
      publishedAt: 1000,
      createdAt: 1000,
      updatedAt: 1000,
    })

    const service = new AnnouncementsService(prisma as never)
    const result = await service.createByProjectKey("proj", { title: "T", content: "C" })

    expect(result.id).toBe("a1")
  })
})
