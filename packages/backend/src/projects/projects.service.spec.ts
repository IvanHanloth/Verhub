import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common"

import { ProjectsService } from "./projects.service"

function createPrismaMock() {
  return {
    project: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  }
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

    const service = new ProjectsService(prisma as never)
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
      created_at: 1767225600,
      updated_at: 1767312000,
    })
  })

  it("extracts author metadata when previewing github repo", async () => {
    const prisma = createPrismaMock()
    const service = new ProjectsService(prisma as never)

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
      published_at: Math.floor(Date.parse("2026-03-20T10:00:00.000Z") / 1000),
      optional_update_min_comparable_version: null,
      optional_update_max_comparable_version: null,
    })

    fetchMock.mockRestore()
  })

  it("throws not found when project does not exist", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new ProjectsService(prisma as never)

    await expect(service.findOne("missing-project")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("throws conflict when project_key already exists", async () => {
    const prisma = createPrismaMock()
    prisma.project.create.mockRejectedValue({ code: "P2002" })

    const service = new ProjectsService(prisma as never)

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

    const service = new ProjectsService(prisma as never)
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

    const service = new ProjectsService(prisma as never)

    await expect(
      service.update("project-1", {
        optional_update_min_comparable_version: "2.0.0",
      }),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.project.update).not.toHaveBeenCalled()
  })
})
