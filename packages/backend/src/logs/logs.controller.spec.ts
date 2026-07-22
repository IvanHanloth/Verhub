import { LogsController } from "./logs.controller"

describe("LogsController", () => {
  const mockService = {
    findAll: jest.fn(),
    createByAdmin: jest.fn(),
    createByProjectKey: jest.fn(),
    getStatistics: jest.fn(),
    getStatus: jest.fn(),
  }

  const origin = {
    ip: "203.0.113.9",
    userAgent: "verhub-sdk/1.0",
    countryCode: "JP",
    countryName: "Japan",
    regionName: "Tokyo",
    city: "Tokyo",
    platform: null,
  }
  const mockOriginService = { describe: jest.fn().mockResolvedValue(origin) }

  let controller: LogsController

  beforeEach(() => {
    jest.clearAllMocks()
    mockOriginService.describe.mockResolvedValue(origin)
    controller = new LogsController(mockService as never, mockOriginService as never)
  })

  it("findAll delegates projectKey and query", async () => {
    const result = { total: 5, data: [] }
    mockService.findAll.mockResolvedValue(result)
    expect(await controller.findAll("proj", { limit: 10 } as never)).toBe(result)
    expect(mockService.findAll).toHaveBeenCalledWith("proj", { limit: 10 })
  })

  it("createByAdmin never attaches the caller origin", async () => {
    const dto = { level: 2, content: "手动补录" }
    mockService.createByAdmin.mockResolvedValue({ id: "l2" })

    await controller.createByAdmin("proj", dto as never)

    expect(mockOriginService.describe).not.toHaveBeenCalled()
    expect(mockService.createByAdmin).toHaveBeenCalledWith("proj", dto)
  })

  it("createByProjectKey passes the observed origin through to the service", async () => {
    const dto = { level: 1, content: "Log message" }
    const request = { headers: {} }
    mockService.createByProjectKey.mockResolvedValue({ id: "l1" })

    await controller.createByProjectKey("proj", dto as never, request as never)

    expect(mockOriginService.describe).toHaveBeenCalledWith(request)
    expect(mockService.createByProjectKey).toHaveBeenCalledWith("proj", dto, origin)
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
