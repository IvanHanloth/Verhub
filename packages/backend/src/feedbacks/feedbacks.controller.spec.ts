import { FeedbacksController } from "./feedbacks.controller"

describe("FeedbacksController", () => {
  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createByProjectKey: jest.fn(),
    getStatistics: jest.fn(),
    getStatus: jest.fn(),
  }

  let controller: FeedbacksController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new FeedbacksController(mockService as never)
  })

  it("findAll delegates projectKey and query", async () => {
    const result = { total: 3, data: [] }
    mockService.findAll.mockResolvedValue(result)
    expect(await controller.findAll("proj", { limit: 10 } as never)).toBe(result)
    expect(mockService.findAll).toHaveBeenCalledWith("proj", { limit: 10 })
  })

  it("findOne delegates projectKey and id", async () => {
    mockService.findOne.mockResolvedValue({ id: "f1" })
    expect(await controller.findOne("proj", "f1")).toEqual({ id: "f1" })
  })

  it("update delegates projectKey, id, and dto", async () => {
    const dto = { content: "updated" }
    mockService.update.mockResolvedValue({ id: "f1" })
    await controller.update("proj", "f1", dto as never)
    expect(mockService.update).toHaveBeenCalledWith("proj", "f1", dto)
  })

  it("remove delegates and returns success", async () => {
    mockService.remove.mockResolvedValue(undefined)
    expect(await controller.remove("proj", "f1")).toEqual({ success: true })
  })

  it("createByProjectKey delegates projectKey and dto", async () => {
    const dto = { content: "feedback" }
    mockService.createByProjectKey.mockResolvedValue({ id: "f1" })
    await controller.createByProjectKey("proj", dto as never)
    expect(mockService.createByProjectKey).toHaveBeenCalledWith("proj", dto)
  })

  it("getStatistics delegates to service", async () => {
    mockService.getStatistics.mockResolvedValue({ count: 5 })
    expect(await controller.getStatistics()).toEqual({ count: 5 })
  })

  it("getModuleStatus returns status", () => {
    mockService.getStatus.mockReturnValue({ module: "feedbacks", implemented: true })
    expect(controller.getModuleStatus()).toEqual({ module: "feedbacks", implemented: true })
  })
})
