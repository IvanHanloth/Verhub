import { LogsController } from "./logs.controller"

describe("LogsController", () => {
  const mockService = {
    findAll: jest.fn(),
    createByProjectKey: jest.fn(),
    getStatistics: jest.fn(),
    getStatus: jest.fn(),
  }

  let controller: LogsController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new LogsController(mockService as never)
  })

  it("findAll delegates projectKey and query", async () => {
    const result = { total: 5, data: [] }
    mockService.findAll.mockResolvedValue(result)
    expect(await controller.findAll("proj", { limit: 10 } as never)).toBe(result)
    expect(mockService.findAll).toHaveBeenCalledWith("proj", { limit: 10 })
  })

  it("createByProjectKey delegates projectKey and dto", async () => {
    const dto = { level: 1, content: "Log message" }
    mockService.createByProjectKey.mockResolvedValue({ id: "l1" })
    await controller.createByProjectKey("proj", dto as never)
    expect(mockService.createByProjectKey).toHaveBeenCalledWith("proj", dto)
  })

  it("getStatistics delegates to service", async () => {
    const stats = { count: 100, debug_count: 10 }
    mockService.getStatistics.mockResolvedValue(stats)
    expect(await controller.getStatistics()).toEqual(stats)
  })

  it("getModuleStatus returns status", () => {
    mockService.getStatus.mockReturnValue({ module: "logs", implemented: true })
    expect(controller.getModuleStatus()).toEqual({ module: "logs", implemented: true })
  })
})
