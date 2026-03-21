import { ConflictException, NotFoundException } from "@nestjs/common"

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
      created_at: 1767225600,
      updated_at: 1767312000,
    })
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
})
