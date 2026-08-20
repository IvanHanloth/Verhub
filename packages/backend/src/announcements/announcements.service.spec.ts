import { BadRequestException, NotFoundException } from "@nestjs/common"
import { makeResolver } from "../../test/project-resolver.testkit"

import { toComparableVersionSortKey } from "../versions/version-comparator"
import { AnnouncementsService } from "./announcements.service"

function createPrismaMock() {
  return {
    project: {
      findUnique: jest.fn(),
    },
    projectLocale: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    version: {
      findFirst: jest.fn().mockResolvedValue(null),
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

/** 公告行永远带 translations（查询一律 include），所以 mock 也得带上。 */
function buildAnnouncementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    projectKey: "proj",
    title: "Title",
    content: "Content",
    isPinned: false,
    isHidden: false,
    platforms: [],
    author: null,
    minComparableVersion: null,
    maxComparableVersion: null,
    minComparableVersionSort: null,
    maxComparableVersionSort: null,
    publishedAt: 1000,
    createdAt: 1000,
    updatedAt: 1000,
    translations: [],
    ...overrides,
  }
}

/** 客户端没报版本号时，可见范围收紧成「两端都为空」。 */
const NO_VERSION_SCOPE = { minComparableVersionSort: null, maxComparableVersionSort: null }

describe("AnnouncementsService", () => {
  it("maps author, hidden flag and platforms when creating announcement", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.announcement.create.mockResolvedValue(
      buildAnnouncementRow({
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
      }),
    )

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
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
        minComparableVersion: undefined,
        maxComparableVersion: undefined,
        minComparableVersionSort: undefined,
        maxComparableVersionSort: undefined,
        publishedAt,
      },
      include: { translations: true },
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
      [buildAnnouncementRow({ id: "announcement-1", platforms: ["WEB"] })],
    ])

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    await service.findAllByProjectKey("project-1", {
      limit: 20,
      offset: 0,
      platform: "web",
    })

    const expectedWhere = {
      projectKey: "project-1",
      isHidden: false,
      AND: [
        { OR: [{ platforms: { isEmpty: true } }, { platforms: { has: "WEB" } }] },
        NO_VERSION_SCOPE,
      ],
    }
    expect(prisma.announcement.count).toHaveBeenCalledWith({ where: expectedWhere })
    expect(prisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    )
  })

  it("latest public announcement should ignore hidden records", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.announcement.findFirst.mockResolvedValue(buildAnnouncementRow({ id: "announcement-1" }))

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    await service.findLatestByProjectKey("project-1")

    expect(prisma.announcement.findFirst).toHaveBeenCalledWith({
      where: { projectKey: "project-1", isHidden: false, AND: [NO_VERSION_SCOPE] },
      orderBy: { createdAt: "desc" },
      include: { translations: { where: { locale: "" } } },
    })
  })

  it("throws when announcement is missing", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findFirst.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))

    await expect(service.findOne("project-1", "missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("getStatistics returns count and pinned_count", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.count.mockResolvedValueOnce(10).mockResolvedValueOnce(3)

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    const stats = await service.getStatistics()

    expect(stats.count).toBe(10)
    expect(stats.pinned_count).toBe(3)
  })

  it("findAll returns paginated announcements", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValue([2, [buildAnnouncementRow()]])

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    const result = await service.findAll("proj", { limit: 10, offset: 0 })

    expect(result.total).toBe(2)
    expect(result.data).toHaveLength(1)
  })

  it("findAll throws when project not found", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    await expect(service.findAll("missing", { limit: 10, offset: 0 })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("findLatestByProjectKey throws when project not found", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    await expect(service.findLatestByProjectKey("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("findLatestByProjectKey throws when no announcements", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.announcement.findFirst.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    await expect(service.findLatestByProjectKey("proj")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("findLatestByProjectKey with platform filter", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.announcement.findFirst.mockResolvedValue(buildAnnouncementRow({ platforms: ["IOS"] }))

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    await service.findLatestByProjectKey("proj", { platform: "ios" })

    expect(prisma.announcement.findFirst).toHaveBeenCalledWith({
      where: {
        projectKey: "proj",
        isHidden: false,
        AND: [
          { OR: [{ platforms: { isEmpty: true } }, { platforms: { has: "IOS" } }] },
          NO_VERSION_SCOPE,
        ],
      },
      orderBy: { createdAt: "desc" },
      include: { translations: { where: { locale: "" } } },
    })
  })

  it("update modifies an announcement", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findFirst.mockResolvedValue({ id: "a1", projectKey: "proj" })
    prisma.announcement.update.mockResolvedValue(
      buildAnnouncementRow({ title: "Updated", isPinned: true, updatedAt: 2000 }),
    )

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    const result = await service.update("proj", "a1", { title: "Updated", is_pinned: true })

    expect(result.title).toBe("Updated")
    expect(result.is_pinned).toBe(true)
  })

  it("update throws when announcement not found", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findFirst.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    await expect(service.update("proj", "missing", { title: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("remove deletes an announcement", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findFirst.mockResolvedValue({ id: "a1" })
    prisma.announcement.delete.mockResolvedValue({})

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    await service.remove("proj", "a1")

    expect(prisma.announcement.delete).toHaveBeenCalledWith({ where: { id: "a1" } })
  })

  it("remove throws when announcement not found", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findFirst.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    await expect(service.remove("proj", "missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("updateById delegates to update", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.announcement.findFirst.mockResolvedValue({ id: "a1", projectKey: "proj" })
    prisma.announcement.update.mockResolvedValue(
      buildAnnouncementRow({ title: "Updated", updatedAt: 2000 }),
    )

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    const result = await service.updateById("a1", { title: "Updated" })

    expect(result.title).toBe("Updated")
  })

  it("updateById throws when id not found", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findUnique.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    await expect(service.updateById("missing", { title: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("removeById delegates to remove", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.announcement.findFirst.mockResolvedValue({ id: "a1" })
    prisma.announcement.delete.mockResolvedValue({})

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    await service.removeById("a1")

    expect(prisma.announcement.delete).toHaveBeenCalledWith({ where: { id: "a1" } })
  })

  it("removeById throws when id not found", async () => {
    const prisma = createPrismaMock()
    prisma.announcement.findUnique.mockResolvedValue(null)

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    await expect(service.removeById("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("getStatus returns module info", () => {
    const prisma = createPrismaMock()
    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    expect(service.getStatus()).toEqual({ module: "announcements", implemented: true })
  })

  it("findAllByProjectKey without platform filter", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.$transaction.mockResolvedValue([0, []])

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    const result = await service.findAllByProjectKey("proj", { limit: 10, offset: 0 })

    expect(result.total).toBe(0)
    expect(prisma.announcement.count).toHaveBeenCalledWith({
      where: { projectKey: "proj", isHidden: false, AND: [NO_VERSION_SCOPE] },
    })
  })

  it("createByProjectKey delegates to create", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.announcement.create.mockResolvedValue(buildAnnouncementRow({ title: "T", content: "C" }))

    const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
    const result = await service.createByProjectKey("proj", { title: "T", content: "C" })

    expect(result.id).toBe("a1")
  })

  // ── 可见版本范围 ──

  describe("可见版本范围", () => {
    it("客户端报了版本号时，按排序键做闭区间比较", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.$transaction.mockResolvedValue([0, []])

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await service.findAllByProjectKey("proj", { limit: 10, offset: 0, version: "2.1.0" })

      const sortKey = toComparableVersionSortKey("2.1.0")
      expect(prisma.announcement.count).toHaveBeenCalledWith({
        where: {
          projectKey: "proj",
          isHidden: false,
          AND: [
            {
              OR: [
                { minComparableVersionSort: null },
                { minComparableVersionSort: { lte: sortKey } },
              ],
            },
            {
              OR: [
                { maxComparableVersionSort: null },
                { maxComparableVersionSort: { gte: sortKey } },
              ],
            },
          ],
        },
      })
    })

    it("版本号解析不了时，回退到版本表按 version 换算", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.$transaction.mockResolvedValue([0, []])
      // "v2.1.0" 不是合法的可比较版本号，但版本表里登记过它
      prisma.version.findFirst.mockResolvedValue({
        comparableVersionSort: toComparableVersionSortKey("2.1.0"),
      })

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await service.findAllByProjectKey("proj", { limit: 10, offset: 0, version: "v2.1.0" })

      expect(prisma.version.findFirst).toHaveBeenCalledWith({
        where: { projectKey: "proj", version: "v2.1.0" },
        select: { comparableVersionSort: true },
      })
      const call = prisma.announcement.count.mock.calls[0]?.[0] as {
        where: { AND: unknown[] }
      }
      expect(call.where.AND).not.toContainEqual(NO_VERSION_SCOPE)
    })

    it("两条解析路都不通时等同没报版本号，带范围的公告一律排除", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.$transaction.mockResolvedValue([0, []])
      prisma.version.findFirst.mockResolvedValue(null)

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await service.findAllByProjectKey("proj", { limit: 10, offset: 0, version: "不是版本号" })

      expect(prisma.announcement.count).toHaveBeenCalledWith({
        where: { projectKey: "proj", isHidden: false, AND: [NO_VERSION_SCOPE] },
      })
    })

    it("创建时把范围两端的排序键一并写入", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.announcement.create.mockResolvedValue(buildAnnouncementRow())

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await service.create("proj", {
        title: "T",
        content: "C",
        min_comparable_version: "2.0.0",
        max_comparable_version: "2.9.9",
      })

      expect(prisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            minComparableVersion: "2.0.0",
            maxComparableVersion: "2.9.9",
            minComparableVersionSort: toComparableVersionSortKey("2.0.0"),
            maxComparableVersionSort: toComparableVersionSortKey("2.9.9"),
          }),
        }),
      )
    })

    it("范围出现在返回体里", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.announcement.findFirst.mockResolvedValue(
        buildAnnouncementRow({ minComparableVersion: "2.0.0", maxComparableVersion: null }),
      )

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      const result = await service.findLatestByProjectKey("proj")

      expect(result.min_comparable_version).toBe("2.0.0")
      expect(result.max_comparable_version).toBeNull()
    })
  })

  // ── 多语言 ──

  describe("多语言", () => {
    it("请求已注册的语言且有译文时返回译文，并标出 locale", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
      prisma.announcement.findFirst.mockResolvedValue(
        buildAnnouncementRow({
          title: "默认标题",
          content: "默认正文",
          translations: [
            { locale: "en-US", title: "English title", content: "English body", isHidden: false },
          ],
        }),
      )

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      const result = await service.findLatestByProjectKey("proj", { locale: "en-US" })

      expect(result.title).toBe("English title")
      expect(result.content).toBe("English body")
      expect(result.locale).toBe("en-US")
    })

    it("语言匹配不区分大小写", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
      prisma.announcement.findFirst.mockResolvedValue(buildAnnouncementRow())

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await service.findLatestByProjectKey("proj", { locale: "EN-us" })

      // 归一到注册时的原样写法再去查译文，否则大小写不同就查不到
      expect(prisma.announcement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ include: { translations: { where: { locale: "en-US" } } } }),
      )
    })

    it("已注册但该公告没有译文时回落默认内容", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
      prisma.announcement.findFirst.mockResolvedValue(
        buildAnnouncementRow({ title: "默认标题", content: "默认正文", translations: [] }),
      )

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      const result = await service.findLatestByProjectKey("proj", { locale: "en-US" })

      expect(result.title).toBe("默认标题")
      expect(result.locale).toBeNull()
    })

    it("请求未注册的语言等同没提偏好", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
      prisma.announcement.findFirst.mockResolvedValue(buildAnnouncementRow({ title: "默认标题" }))

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      const result = await service.findLatestByProjectKey("proj", { locale: "ja-JP" })

      expect(result.title).toBe("默认标题")
      expect(result.locale).toBeNull()
      expect(prisma.announcement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ include: { translations: { where: { locale: "" } } } }),
      )
    })

    it("公开端不带出全部译文", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.announcement.findFirst.mockResolvedValue(buildAnnouncementRow())

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      const result = await service.findLatestByProjectKey("proj")

      expect(result.translations).toBeUndefined()
    })

    it("后台端带出全部译文", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.announcement.findFirst.mockResolvedValue(
        buildAnnouncementRow({
          translations: [{ locale: "en-US", title: "T", content: "C", isHidden: false }],
        }),
      )

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      const result = await service.findOne("proj", "a1")

      expect(result.translations).toEqual([
        { locale: "en-US", title: "T", content: "C", is_hidden: false },
      ])
      expect(result.locale).toBeNull()
    })

    it("创建时写入译文，并归一到注册时的写法", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
      prisma.announcement.create.mockResolvedValue(buildAnnouncementRow())

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await service.create("proj", {
        title: "T",
        content: "C",
        translations: [{ locale: "en-us", title: "English", content: "Body" }],
      })

      expect(prisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            translations: {
              create: [{ locale: "en-US", title: "English", content: "Body", isHidden: false }],
            },
          }),
        }),
      )
    })

    it("译文语言没注册过就整个请求 400", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await expect(
        service.create("proj", {
          title: "T",
          content: "C",
          translations: [{ locale: "ja-JP", title: "T", content: "C" }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.announcement.create).not.toHaveBeenCalled()
    })

    it("同一请求里重复提交同一语言就 400", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await expect(
        service.create("proj", {
          title: "T",
          content: "C",
          translations: [
            { locale: "en-US", title: "A", content: "A" },
            { locale: "en-us", title: "B", content: "B" },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it("更新时传 translations 即整体替换，不传则不动", async () => {
      const prisma = createPrismaMock()
      prisma.announcement.findFirst.mockResolvedValue({ id: "a1", projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
      prisma.announcement.update.mockResolvedValue(buildAnnouncementRow())

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))

      await service.update("proj", "a1", {
        translations: [{ locale: "en-US", title: "T", content: "C" }],
      })
      expect(prisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            translations: {
              deleteMany: {},
              create: [{ locale: "en-US", title: "T", content: "C", isHidden: false }],
            },
          }),
        }),
      )

      prisma.announcement.update.mockClear()
      await service.update("proj", "a1", { title: "只改标题" })
      const data = prisma.announcement.update.mock.calls[0]?.[0] as {
        data: Record<string, unknown>
      }
      expect(data.data).not.toHaveProperty("translations")
    })

    it("传空数组即清空全部译文", async () => {
      const prisma = createPrismaMock()
      prisma.announcement.findFirst.mockResolvedValue({ id: "a1", projectKey: "proj" })
      prisma.announcement.update.mockResolvedValue(buildAnnouncementRow())

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await service.update("proj", "a1", { translations: [] })

      expect(prisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            translations: { deleteMany: {}, create: [] },
          }),
        }),
      )
    })

    it("译文按字段回落：只填标题时正文仍用默认内容", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
      prisma.announcement.findFirst.mockResolvedValue(
        buildAnnouncementRow({
          title: "默认标题",
          content: "默认正文",
          translations: [
            { locale: "en-US", title: "English title", content: null, isHidden: false },
          ],
        }),
      )

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      const result = await service.findLatestByProjectKey("proj", { locale: "en-US" })

      expect(result.title).toBe("English title")
      expect(result.content).toBe("默认正文")
      expect(result.locale).toBe("en-US")
    })

    it("只设了隐藏的译文行不算「返回了译文」", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
      prisma.announcement.findFirst.mockResolvedValue(
        buildAnnouncementRow({
          title: "默认标题",
          translations: [{ locale: "en-US", title: null, content: null, isHidden: true }],
        }),
      )

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      const result = await service.findLatestByProjectKey("proj", { locale: "en-US" })

      expect(result.title).toBe("默认标题")
      expect(result.locale).toBeNull()
    })

    it("三个字段都空的译文行会被拒", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await expect(
        service.create("proj", {
          title: "T",
          content: "C",
          translations: [{ locale: "en-US", title: "  ", content: "" }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it("同义标签命中时返回主标签，并按主标签取译文", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([
        { locale: "en", aliases: ["en-US", "en-GB"] },
      ])
      prisma.announcement.findFirst.mockResolvedValue(
        buildAnnouncementRow({
          translations: [{ locale: "en", title: "English", content: "Body", isHidden: false }],
        }),
      )

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      const result = await service.findLatestByProjectKey("proj", { locale: "en-GB" })

      expect(prisma.announcement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ include: { translations: { where: { locale: "en" } } } }),
      )
      // 译文是按主标签存的，报出 en-GB 会让调用方以为存在一份独立的 en-GB 译文
      expect(result.locale).toBe("en")
      expect(result.title).toBe("English")
    })
  })

  // ── 语言级隐藏 ──

  describe("语言级隐藏", () => {
    it("请求某个语言时，排除该语言下标了隐藏的公告", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
      prisma.$transaction.mockResolvedValue([0, []])

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await service.findAllByProjectKey("proj", { limit: 10, offset: 0, locale: "en-US" })

      const where = prisma.announcement.count.mock.calls[0]?.[0] as {
        where: { AND: unknown[] }
      }
      expect(where.where.AND).toContainEqual({
        NOT: { translations: { some: { locale: "en-US", isHidden: true } } },
      })
    })

    it("没提语言偏好时不加语言级隐藏的过滤", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.$transaction.mockResolvedValue([0, []])

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await service.findAllByProjectKey("proj", { limit: 10, offset: 0 })

      // 语言级隐藏只对那个语言生效，默认请求不该被它影响
      expect(prisma.announcement.count).toHaveBeenCalledWith({
        where: { projectKey: "proj", isHidden: false, AND: [NO_VERSION_SCOPE] },
      })
    })

    it("语言未注册时同样不加该过滤", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
      prisma.$transaction.mockResolvedValue([0, []])

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await service.findAllByProjectKey("proj", { limit: 10, offset: 0, locale: "ja-JP" })

      expect(prisma.announcement.count).toHaveBeenCalledWith({
        where: { projectKey: "proj", isHidden: false, AND: [NO_VERSION_SCOPE] },
      })
    })

    it("只设隐藏、不写译文的行可以存下来", async () => {
      const prisma = createPrismaMock()
      prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
      prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
      prisma.announcement.create.mockResolvedValue(buildAnnouncementRow())

      const service = new AnnouncementsService(prisma as never, makeResolver(prisma))
      await service.create("proj", {
        title: "T",
        content: "C",
        translations: [{ locale: "en-US", is_hidden: true }],
      })

      expect(prisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            translations: {
              create: [{ locale: "en-US", title: null, content: null, isHidden: true }],
            },
          }),
        }),
      )
    })
  })
})
