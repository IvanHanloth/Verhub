import { NotFoundException } from "@nestjs/common"

import { ActionsService } from "./actions.service"

type PrismaMock = {
  action: {
    count: jest.Mock
    create: jest.Mock
    delete: jest.Mock
    findMany: jest.Mock
    findUnique: jest.Mock
    update: jest.Mock
  }
  actionRecord: {
    count: jest.Mock
    create: jest.Mock
    findMany: jest.Mock
    findUnique: jest.Mock
  }
  project: {
    findUnique: jest.Mock
  }
  $transaction: jest.Mock
}

function createPrismaMock(): PrismaMock {
  const mock: PrismaMock = {
    action: {
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    actionRecord: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  }
  return mock
}

describe("ActionsService", () => {
  it("creates an action for an existing project", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "my-app" })
    prisma.action.create.mockResolvedValue({
      id: "action-1",
      name: "page_view",
      description: "User viewed a page",
      customData: null,
      createdAt: 1000,
      project: { projectKey: "my-app" },
    })

    const service = new ActionsService(prisma as never)
    const result = await service.create({
      project_key: "My-App",
      name: "page_view",
      description: "User viewed a page",
    })

    expect(result).toEqual({
      action_id: "action-1",
      project_key: "my-app",
      name: "page_view",
      description: "User viewed a page",
      custom_data: null,
      created_time: 1000,
    })
    expect(prisma.project.findUnique).toHaveBeenCalledWith({
      where: { projectKey: "my-app" },
      select: { projectKey: true },
    })
  })

  it("throws NotFoundException when creating action for non-existent project", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new ActionsService(prisma as never)

    await expect(
      service.create({ project_key: "missing", name: "test", description: "" }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it("updates an existing action", async () => {
    const prisma = createPrismaMock()
    prisma.action.findUnique.mockResolvedValue({
      id: "action-1",
      project: { projectKey: "my-app" },
    })
    prisma.action.update.mockResolvedValue({
      id: "action-1",
      name: "page_view_v2",
      description: "Updated description",
      customData: null,
      createdAt: 1000,
      project: { projectKey: "my-app" },
    })

    const service = new ActionsService(prisma as never)
    const result = await service.update("action-1", {
      name: "page_view_v2",
      description: "Updated description",
    })

    expect(result.name).toBe("page_view_v2")
    expect(prisma.action.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "action-1" },
        data: expect.objectContaining({
          name: "page_view_v2",
          description: "Updated description",
          updatedAt: expect.any(Number),
        }),
      }),
    )
  })

  it("removes an action", async () => {
    const prisma = createPrismaMock()
    prisma.action.findUnique.mockResolvedValue({ id: "action-1" })
    prisma.action.delete.mockResolvedValue({ id: "action-1" })

    const service = new ActionsService(prisma as never)
    await service.remove("action-1")

    expect(prisma.action.delete).toHaveBeenCalledWith({ where: { id: "action-1" } })
  })

  it("throws NotFoundException when removing non-existent action", async () => {
    const prisma = createPrismaMock()
    prisma.action.findUnique.mockResolvedValue(null)

    const service = new ActionsService(prisma as never)

    await expect(service.remove("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("creates a record by project key", async () => {
    const prisma = createPrismaMock()
    prisma.action.findUnique.mockResolvedValue({
      id: "action-1",
      project: { projectKey: "my-app" },
    })
    prisma.actionRecord.create.mockResolvedValue({
      id: "record-1",
      actionId: "action-1",
      http: { ip: "127.0.0.1" },
      customData: null,
      createdAt: 2000,
    })

    const service = new ActionsService(prisma as never)
    const result = await service.createRecordByProjectKey(
      "My-App",
      { action_id: "action-1" },
      { ip: "127.0.0.1" },
    )

    expect(result).toEqual({
      action_record_id: "record-1",
      action_id: "action-1",
      created_time: 2000,
      http: { ip: "127.0.0.1" },
      custom_data: null,
    })
  })

  it("rejects record creation when action does not belong to project", async () => {
    const prisma = createPrismaMock()
    prisma.action.findUnique.mockResolvedValue({
      id: "action-1",
      project: { projectKey: "other-project" },
    })

    const service = new ActionsService(prisma as never)

    await expect(
      service.createRecordByProjectKey("my-app", { action_id: "action-1" }, {}),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it("returns action statistics count", async () => {
    const prisma = createPrismaMock()
    prisma.action.count.mockResolvedValue(42)

    const service = new ActionsService(prisma as never)
    const result = await service.getActionStatistics()

    expect(result).toEqual({ count: 42 })
  })

  it("returns module status", () => {
    const prisma = createPrismaMock()
    const service = new ActionsService(prisma as never)

    expect(service.getStatus()).toEqual({ module: "actions", implemented: true })
  })

  it("findAllByProject returns paginated actions", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ projectKey: "my-app" })
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          id: "action-1",
          name: "click",
          description: "Click event",
          customData: null,
          createdAt: 1000,
          project: { projectKey: "my-app" },
        },
      ],
    ])

    const service = new ActionsService(prisma as never)
    const result = await service.findAllByProject("my-app", { limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.data[0].action_id).toBe("action-1")
  })

  it("findAllByProject throws when project not found", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)

    const service = new ActionsService(prisma as never)
    await expect(
      service.findAllByProject("missing", { limit: 10, offset: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it("findRecordsByAction returns records", async () => {
    const prisma = createPrismaMock()
    prisma.action.findUnique.mockResolvedValue({ id: "action-1" })
    prisma.$transaction.mockResolvedValue([
      1,
      [
        {
          id: "record-1",
          actionId: "action-1",
          http: null,
          customData: null,
          createdAt: 2000,
        },
      ],
    ])

    const service = new ActionsService(prisma as never)
    const result = await service.findRecordsByAction("action-1", { limit: 10, offset: 0 })

    expect(result.total).toBe(1)
    expect(result.data[0].action_record_id).toBe("record-1")
  })

  it("findRecordsByAction throws when action not found", async () => {
    const prisma = createPrismaMock()
    prisma.action.findUnique.mockResolvedValue(null)

    const service = new ActionsService(prisma as never)
    await expect(
      service.findRecordsByAction("missing", { limit: 10, offset: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it("findRecord returns a single record", async () => {
    const prisma = createPrismaMock()
    prisma.actionRecord.findUnique.mockResolvedValue({
      id: "record-1",
      actionId: "action-1",
      http: { ua: "test" },
      customData: null,
      createdAt: 3000,
    })

    const service = new ActionsService(prisma as never)
    const result = await service.findRecord("record-1")

    expect(result.action_record_id).toBe("record-1")
    expect(result.http).toEqual({ ua: "test" })
  })

  it("findRecord throws when record not found", async () => {
    const prisma = createPrismaMock()
    prisma.actionRecord.findUnique.mockResolvedValue(null)

    const service = new ActionsService(prisma as never)
    await expect(service.findRecord("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("update throws when action not found", async () => {
    const prisma = createPrismaMock()
    prisma.action.findUnique.mockResolvedValue(null)

    const service = new ActionsService(prisma as never)
    await expect(service.update("missing", { name: "x", description: "y" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("getActionRecordStatistics returns count", async () => {
    const prisma = createPrismaMock()
    prisma.actionRecord.count.mockResolvedValue(100)

    const service = new ActionsService(prisma as never)
    const result = await service.getActionRecordStatistics()

    expect(result).toEqual({ count: 100 })
  })

  it("createRecordByProjectKey throws when action not found", async () => {
    const prisma = createPrismaMock()
    prisma.action.findUnique.mockResolvedValue(null)

    const service = new ActionsService(prisma as never)
    await expect(
      service.createRecordByProjectKey("my-app", { action_id: "missing" }, {}),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
