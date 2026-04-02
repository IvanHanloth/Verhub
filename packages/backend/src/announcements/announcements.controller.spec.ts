import { AnnouncementsController } from "./announcements.controller"

describe("AnnouncementsController", () => {
  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getStatus: jest.fn(),
  }

  let controller: AnnouncementsController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new AnnouncementsController(mockService as never)
  })

  it("findAll delegates projectKey and query", async () => {
    const result = { total: 3, data: [] }
    mockService.findAll.mockResolvedValue(result)
    expect(await controller.findAll("proj", { limit: 10 } as never)).toBe(result)
  })

  it("getModuleStatus returns status", () => {
    mockService.getStatus.mockReturnValue({ module: "announcements", implemented: true })
    expect(controller.getModuleStatus()).toEqual({ module: "announcements", implemented: true })
  })

  it("findOne delegates projectKey and id", async () => {
    mockService.findOne.mockResolvedValue({ id: "a1" })
    expect(await controller.findOne("proj", "a1")).toEqual({ id: "a1" })
  })

  it("create delegates projectKey and dto", async () => {
    const dto = { title: "New" }
    mockService.create.mockResolvedValue({ id: "a1" })
    await controller.create("proj", dto as never)
    expect(mockService.create).toHaveBeenCalledWith("proj", dto)
  })

  it("update delegates projectKey, id, and dto", async () => {
    const dto = { title: "Updated" }
    mockService.update.mockResolvedValue({ id: "a1" })
    await controller.update("proj", "a1", dto as never)
    expect(mockService.update).toHaveBeenCalledWith("proj", "a1", dto)
  })

  it("remove delegates and returns success", async () => {
    mockService.remove.mockResolvedValue(undefined)
    expect(await controller.remove("proj", "a1")).toEqual({ success: true })
  })
})
