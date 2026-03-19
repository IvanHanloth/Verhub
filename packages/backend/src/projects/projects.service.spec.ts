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
          id: "project-1",
          projectKey: "verhub",
          name: "Verhub",
          repoUrl: "https://github.com/example/verhub",
          description: "version hub",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
    ])

    const service = new ProjectsService(prisma as never)
    const result = await service.findAll({ limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.data[0]).toEqual({
      id: "project-1",
      project_key: "verhub",
      name: "Verhub",
      repo_url: "https://github.com/example/verhub",
      description: "version hub",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
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
    prisma.project.findUnique.mockResolvedValue({ id: "project-1" })
    prisma.project.delete.mockResolvedValue({ id: "project-1" })

    const service = new ProjectsService(prisma as never)
    await service.remove("project-1")

    expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: "project-1" } })
  })
})
