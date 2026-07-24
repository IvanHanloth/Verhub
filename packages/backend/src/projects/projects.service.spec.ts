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
      created_at: 1767225600,
      updated_at: 1767312000,
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
})
