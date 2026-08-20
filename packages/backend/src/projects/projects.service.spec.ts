import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common"

import { makeResolver } from "../../test/project-resolver.testkit"
import { ProjectsService } from "./projects.service"

function createPrismaMock() {
  const project = {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  }
  // findUniqueOrThrow 复用 findUnique 的 mock 返回，测试只需 mock 一处。
  project.findUniqueOrThrow.mockImplementation((args: unknown) => project.findUnique(args))
  return {
    project,
    projectAlias: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    projectLocale: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  }
}

/** 建服务时统一注入用同一个 prisma mock 驱动的解析器。 */
function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new ProjectsService(prisma as never, makeResolver(prisma))
}

describe("ProjectsService", () => {
  it("returns paginated project list", async () => {
    const prisma = createPrismaMock()
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          projectKey: "verhub",
          name: "Verhub",
          repoUrl: "https://github.com/example/verhub",
          description: "version hub",
          author: null,
          authorHomepageUrl: null,
          iconUrl: null,
          websiteUrl: null,
          publishedAt: null,
          optionalUpdateMinComparableVersion: null,
          optionalUpdateMaxComparableVersion: null,
          createdAt: 1767225600,
          updatedAt: 1767312000,
        },
      ],
    ])

    const service = createService(prisma)
    const result = await service.findAll({ limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.data[0]).toEqual({
      id: "verhub",
      project_key: "verhub",
      name: "Verhub",
      repo_url: "https://github.com/example/verhub",
      description: "version hub",
      author: null,
      author_homepage_url: null,
      icon_url: null,
      website_url: null,
      published_at: null,
      optional_update_min_comparable_version: null,
      optional_update_max_comparable_version: null,
      aliases: [],
      locale: null,
      translations: [],
      created_at: 1767225600,
      updated_at: 1767312000,
    })
  })

  it("findAll matches the keyword against project fields and aliases", async () => {
    const prisma = createPrismaMock()
    prisma.$transaction.mockResolvedValue([0, []])

    const service = createService(prisma)
    await service.findAll({ limit: 10, offset: 0, search: "verhub" })

    const where = prisma.project.count.mock.calls[0]?.[0]?.where as {
      OR?: Array<Record<string, unknown>>
    }
    expect(where.OR).toContainEqual({
      projectKey: { contains: "verhub", mode: "insensitive" },
    })
    // 改名后的项目要能按旧 key 搜到，所以别名表也参与匹配。
    expect(where.OR).toContainEqual({
      aliases: { some: { alias: { contains: "verhub", mode: "insensitive" } } },
    })
  })

  it("extracts author metadata when previewing github repo", async () => {
    const prisma = createPrismaMock()
    const service = createService(prisma)

    const fetchMock = jest.spyOn(global, "fetch" as never).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: "Hello-World",
        full_name: "octocat/Hello-World",
        description: "Sample project",
        html_url: "https://github.com/octocat/Hello-World",
        homepage: "https://example.com",
        created_at: "2026-03-20T10:00:00.000Z",
        owner: {
          login: "octocat",
          html_url: "https://github.com/octocat",
          avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
        },
      }),
    } as never)

    const preview = await service.previewFromGithubRepo("https://github.com/octocat/Hello-World")

    expect(preview).toEqual({
      project_key: "octocat-hello-world",
      name: "octocat/Hello-World",
      repo_url: "https://github.com/octocat/Hello-World",
      description: "Sample project",
      author: "octocat",
      author_homepage_url: "https://github.com/octocat",
      icon_url: "https://avatars.githubusercontent.com/u/1?v=4",
      website_url: "https://example.com",
      docs_url: null,
      published_at: Math.floor(Date.parse("2026-03-20T10:00:00.000Z") / 1000),
      optional_update_min_comparable_version: null,
      optional_update_max_comparable_version: null,
    })

    fetchMock.mockRestore()
  })

  it("throws not found when project does not exist", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = createService(prisma)

    await expect(service.findOne("missing-project")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("throws conflict when project_key already exists", async () => {
    const prisma = createPrismaMock()
    prisma.project.create.mockRejectedValue({ code: "P2002" })

    const service = createService(prisma)

    await expect(
      service.create({
        project_key: "verhub",
        name: "Verhub",
        repo_url: undefined,
        description: undefined,
      }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it("deletes project after existence check", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "project-1" })
    prisma.project.delete.mockResolvedValue({ projectKey: "project-1" })

    const service = createService(prisma)
    await service.remove("project-1")

    expect(prisma.project.delete).toHaveBeenCalledWith({ where: { projectKey: "project-1" } })
  })

  it("validates comparable range against existing values on partial update", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({
      projectKey: "project-1",
      name: "Project",
      repoUrl: null,
      description: null,
      author: null,
      authorHomepageUrl: null,
      iconUrl: null,
      websiteUrl: null,
      publishedAt: null,
      optionalUpdateMinComparableVersion: undefined,
      optionalUpdateMaxComparableVersion: "1.0.0",
      createdAt: 1,
      updatedAt: 1,
    })

    const service = createService(prisma)

    await expect(
      service.update("project-1", {
        optional_update_min_comparable_version: "2.0.0",
      }),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.project.update).not.toHaveBeenCalled()
  })

  it("normalizes empty optional comparable range to null on update", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({
      projectKey: "project-1",
      name: "Project",
      repoUrl: null,
      description: null,
      author: null,
      authorHomepageUrl: null,
      iconUrl: null,
      websiteUrl: null,
      publishedAt: null,
      optionalUpdateMinComparableVersion: "1.0.0",
      optionalUpdateMaxComparableVersion: "2.0.0",
      createdAt: 1,
      updatedAt: 1,
    })
    prisma.project.update.mockResolvedValue({
      projectKey: "project-1",
      name: "Project",
      repoUrl: null,
      description: null,
      author: null,
      authorHomepageUrl: null,
      iconUrl: null,
      websiteUrl: null,
      publishedAt: null,
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
      createdAt: 1,
      updatedAt: 2,
    })

    const service = createService(prisma)
    await service.update("project-1", {
      optional_update_min_comparable_version: "   ",
      optional_update_max_comparable_version: "",
    })

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          optionalUpdateMinComparableVersion: null,
          optionalUpdateMaxComparableVersion: null,
        }),
      }),
    )
  })

  it("getStatistics returns project count", async () => {
    const prisma = createPrismaMock()
    prisma.project.count.mockResolvedValue(5)

    const service = createService(prisma)
    const stats = await service.getStatistics()

    expect(stats).toEqual({ count: 5 })
  })

  it("findOneByProjectKey returns project", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({
      projectKey: "proj",
      name: "Proj",
      repoUrl: null,
      description: null,
      author: null,
      authorHomepageUrl: null,
      iconUrl: null,
      websiteUrl: null,
      publishedAt: null,
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
      createdAt: 1000,
      updatedAt: 1000,
    })

    const service = createService(prisma)
    const result = await service.findOneByProjectKey("proj")

    expect(result.project_key).toBe("proj")
  })

  it("findOneByProjectKey throws when not found", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = createService(prisma)
    await expect(service.findOneByProjectKey("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("update modifies a project", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({
      projectKey: "proj",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.project.update.mockResolvedValue({
      projectKey: "proj",
      name: "Updated",
      repoUrl: null,
      description: "new desc",
      author: null,
      authorHomepageUrl: null,
      iconUrl: null,
      websiteUrl: null,
      publishedAt: null,
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
      createdAt: 1000,
      updatedAt: 2000,
    })

    const service = createService(prisma)
    const result = await service.update("proj", { name: "Updated", description: "new desc" })

    expect(result.name).toBe("Updated")
  })

  it("update throws when project not found", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = createService(prisma)
    await expect(service.update("missing", { name: "x" })).rejects.toBeInstanceOf(NotFoundException)
  })

  it("update throws conflict on duplicate project_key", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({
      projectKey: "proj",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.project.update.mockRejectedValue({ code: "P2002" })

    const service = createService(prisma)
    await expect(service.update("proj", { project_key: "dup" })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it("remove throws when project not found", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = createService(prisma)
    await expect(service.remove("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("previewFromGithubRepo throws NotFoundException for 404", async () => {
    const prisma = createPrismaMock()
    const service = createService(prisma)

    const fetchMock = jest.spyOn(global, "fetch" as never).mockResolvedValue({
      ok: false,
      status: 404,
    } as never)

    await expect(
      service.previewFromGithubRepo("https://github.com/owner/nonexistent"),
    ).rejects.toBeInstanceOf(NotFoundException)

    fetchMock.mockRestore()
  })

  it("getStatus returns module info", () => {
    const prisma = createPrismaMock()
    const service = createService(prisma)
    expect(service.getStatus()).toEqual({ module: "projects", implemented: true })
  })

  it("rename registers the old project_key as an alias inside a transaction", async () => {
    const prisma = createPrismaMock()
    // findUnique 调用序：resolver 解析 id → ensureRenameTargetAvailable 查新 key。
    prisma.project.findUnique
      .mockResolvedValueOnce({ projectKey: "old-key" })
      .mockResolvedValueOnce(null)
    // findUniqueOrThrow 调用序：取当前项目 → 事务末尾重取改名后的项目（带别名）。
    prisma.project.findUniqueOrThrow
      .mockResolvedValueOnce({
        projectKey: "old-key",
        optionalUpdateMinComparableVersion: null,
        optionalUpdateMaxComparableVersion: null,
      })
      .mockResolvedValueOnce({
        projectKey: "new-key",
        name: "Proj",
        repoUrl: null,
        description: null,
        author: null,
        authorHomepageUrl: null,
        iconUrl: null,
        websiteUrl: null,
        publishedAt: null,
        optionalUpdateMinComparableVersion: null,
        optionalUpdateMaxComparableVersion: null,
        statsRetentionDays: 365,
        aliases: [{ alias: "old-key" }],
        createdAt: 1000,
        updatedAt: 2000,
      })
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma))

    const service = createService(prisma)
    const result = await service.update("old-key", { project_key: "new-key" })

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectKey: "old-key" },
        data: expect.objectContaining({ projectKey: "new-key" }),
      }),
    )
    expect(prisma.projectAlias.create).toHaveBeenCalledWith({
      data: { alias: "old-key", projectKey: "new-key" },
    })
    expect(result.project_key).toBe("new-key")
    expect(result.aliases).toEqual(["old-key"])
  })

  it("rename rejects a new project_key already used as another project's alias", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique
      .mockResolvedValueOnce({ projectKey: "old-key" }) // resolver
      .mockResolvedValueOnce(null) // 新 key 无同名项目
    prisma.project.findUniqueOrThrow.mockResolvedValueOnce({
      projectKey: "old-key",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.projectAlias.findUnique.mockResolvedValueOnce({ projectKey: "other-project" })

    const service = createService(prisma)
    await expect(service.update("old-key", { project_key: "taken" })).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(prisma.project.update).not.toHaveBeenCalled()
  })

  it("create rejects a project_key already used as an alias", async () => {
    const prisma = createPrismaMock()
    prisma.projectAlias.findUnique.mockResolvedValueOnce({ alias: "taken" })

    const service = createService(prisma)
    await expect(
      service.create({ project_key: "taken", name: "X" } as never),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.project.create).not.toHaveBeenCalled()
  })

  it("findOneByProjectKey resolves an alias to the current project", async () => {
    const prisma = createPrismaMock()
    // 项目本身查不到该 key，别名命中 canonical。
    prisma.project.findUnique.mockResolvedValueOnce(null)
    prisma.projectAlias.findUnique.mockResolvedValueOnce({ projectKey: "new-key" })
    prisma.project.findUniqueOrThrow.mockResolvedValueOnce({
      projectKey: "new-key",
      name: "Proj",
      repoUrl: null,
      description: null,
      author: null,
      authorHomepageUrl: null,
      iconUrl: null,
      websiteUrl: null,
      publishedAt: null,
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
      statsRetentionDays: 365,
      aliases: [{ alias: "old-key" }],
      createdAt: 1000,
      updatedAt: 2000,
    })

    const service = createService(prisma)
    const result = await service.findOneByProjectKey("old-key")

    expect(result.project_key).toBe("new-key")
    expect(result.aliases).toEqual(["old-key"])
  })

  it("listAliases returns the project's aliases newest first", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "new-key" })
    prisma.projectAlias.findMany.mockResolvedValueOnce([
      { alias: "old-key", createdAt: 2000 },
      { alias: "older-key", createdAt: 1000 },
    ])

    const service = createService(prisma)
    const result = await service.listAliases("new-key")

    expect(result.data).toEqual([
      { alias: "old-key", created_at: 2000 },
      { alias: "older-key", created_at: 1000 },
    ])
  })

  it("removeAlias throws when the alias does not belong to the project", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "new-key" })
    prisma.projectAlias.deleteMany.mockResolvedValueOnce({ count: 0 })

    const service = createService(prisma)
    await expect(service.removeAlias("new-key", "unknown")).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  // ── 语言注册 ──

  it("listLocales returns registered locales oldest first", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.projectLocale.findMany.mockResolvedValue([
      { locale: "zh-CN", aliases: [], label: "简体中文", createdAt: 1000 },
      { locale: "en-US", aliases: ["en", "en-GB"], label: null, createdAt: 2000 },
    ])

    const service = createService(prisma)
    const result = await service.listLocales("proj")

    expect(result.data).toEqual([
      { locale: "zh-CN", aliases: [], label: "简体中文", created_at: 1000 },
      { locale: "en-US", aliases: ["en", "en-GB"], label: null, created_at: 2000 },
    ])
  })

  it("addLocale registers a new locale", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.projectLocale.upsert.mockResolvedValue({
      locale: "en-US",
      aliases: [],
      label: "English",
      createdAt: 1000,
    })

    const service = createService(prisma)
    const result = await service.addLocale("proj", { locale: "en-US", label: "English" })

    expect(prisma.projectLocale.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectKey_locale: { projectKey: "proj", locale: "en-US" } },
      }),
    )
    expect(result.locale).toBe("en-US")
  })

  it("addLocale updates the existing row instead of creating a case variant", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
    prisma.projectLocale.upsert.mockResolvedValue({
      locale: "en-US",
      aliases: [],
      label: "英文",
      createdAt: 1000,
    })

    const service = createService(prisma)
    await service.addLocale("proj", { locale: "EN-us", label: "英文" })

    // 认已注册的 en-US，而不是新建一行 EN-us —— 否则译文会分裂到两个语言下
    expect(prisma.projectLocale.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectKey_locale: { projectKey: "proj", locale: "en-US" } },
        update: { aliases: [], label: "英文" },
      }),
    )
  })

  it("removeLocale matches case-insensitively and leaves translations alone", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])

    const service = createService(prisma)
    await service.removeLocale("proj", "en-us")

    expect(prisma.projectLocale.delete).toHaveBeenCalledWith({
      where: { projectKey_locale: { projectKey: "proj", locale: "en-US" } },
    })
  })

  it("removeLocale throws when the locale is not registered", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.projectLocale.findMany.mockResolvedValue([])

    const service = createService(prisma)
    await expect(service.removeLocale("proj", "ja-JP")).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.projectLocale.delete).not.toHaveBeenCalled()
  })

  // ── 同义标签 ──

  it("addLocale stores aliases and drops the ones that repeat the canonical tag", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.projectLocale.upsert.mockResolvedValue({
      locale: "en",
      aliases: ["en-US", "en-GB"],
      label: null,
      createdAt: 1000,
    })

    const service = createService(prisma)
    await service.addLocale("proj", { locale: "en", aliases: ["en-US", "EN", "en-GB", "en-us"] })

    expect(prisma.projectLocale.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        // "EN" 是主标签自己，"en-us" 与 "en-US" 重复，都被丢掉
        create: expect.objectContaining({ aliases: ["en-US", "en-GB"] }),
      }),
    )
  })

  it("addLocale rejects an alias already owned by another locale", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.projectLocale.findMany.mockResolvedValue([
      { locale: "en", aliases: ["en-GB"] },
      { locale: "zh-CN", aliases: [] },
    ])

    const service = createService(prisma)

    await expect(
      service.addLocale("proj", { locale: "fr", aliases: ["EN-gb"] }),
    ).rejects.toBeInstanceOf(BadRequestException)
    // 撞上别的语言的主标签同样不行
    await expect(
      service.addLocale("proj", { locale: "fr", aliases: ["zh-cn"] }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.projectLocale.upsert).not.toHaveBeenCalled()
  })

  it("removeLocale matches an alias, not just the canonical tag", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "proj" })
    prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en", aliases: ["en-US"] }])

    const service = createService(prisma)
    await service.removeLocale("proj", "en-us")

    expect(prisma.projectLocale.delete).toHaveBeenCalledWith({
      where: { projectKey_locale: { projectKey: "proj", locale: "en" } },
    })
  })

  // ── 项目译文 ──

  it("findOneByProjectKey overrides name and description per field", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({
      projectKey: "proj",
      name: "默认名称",
      description: "默认描述",
      repoUrl: null,
      author: null,
      authorHomepageUrl: null,
      iconUrl: null,
      websiteUrl: null,
      publishedAt: null,
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
      createdAt: 1,
      updatedAt: 1,
      aliases: [],
      // 只翻了描述，名称留空
      translations: [{ locale: "en-US", name: null, description: "English description" }],
    })
    prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])

    const service = createService(prisma)
    const result = await service.findOneByProjectKey("proj", "en-US")

    expect(result.name).toBe("默认名称")
    expect(result.description).toBe("English description")
    expect(result.locale).toBe("en-US")
    // 公开端不带出全部译文
    expect(result.translations).toBeUndefined()
  })

  it("findOneByProjectKey falls back when the locale is not registered", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({
      projectKey: "proj",
      name: "默认名称",
      description: "默认描述",
      repoUrl: null,
      author: null,
      authorHomepageUrl: null,
      iconUrl: null,
      websiteUrl: null,
      publishedAt: null,
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
      createdAt: 1,
      updatedAt: 1,
      aliases: [],
      translations: [{ locale: "en-US", name: "English", description: null }],
    })
    prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])

    const service = createService(prisma)
    const result = await service.findOneByProjectKey("proj", "ja-JP")

    expect(result.name).toBe("默认名称")
    expect(result.locale).toBeNull()
  })

  it("update replaces the whole translation set", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({
      projectKey: "proj",
      name: "Project",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.projectLocale.findMany.mockResolvedValue([{ locale: "en-US", aliases: [] }])
    prisma.project.update.mockResolvedValue({
      projectKey: "proj",
      name: "Project",
      description: null,
      repoUrl: null,
      author: null,
      authorHomepageUrl: null,
      iconUrl: null,
      websiteUrl: null,
      publishedAt: null,
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
      createdAt: 1,
      updatedAt: 2,
      aliases: [],
      translations: [],
    })

    const service = createService(prisma)
    await service.update("proj", {
      translations: [{ locale: "en-US", name: "English", description: "  " }],
    })

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          translations: {
            deleteMany: {},
            // 全空白的描述归一成 null，回落到项目自身的值
            create: [{ locale: "en-US", name: "English", description: null }],
          },
        }),
      }),
    )
  })

  it("update rejects a translation for an unregistered locale", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({
      projectKey: "proj",
      optionalUpdateMinComparableVersion: null,
      optionalUpdateMaxComparableVersion: null,
    })
    prisma.projectLocale.findMany.mockResolvedValue([])

    const service = createService(prisma)

    await expect(
      service.update("proj", { translations: [{ locale: "en-US", name: "English" }] }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.project.update).not.toHaveBeenCalled()
  })
})
