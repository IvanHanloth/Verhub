import { ActionsController } from "./actions.controller"

describe("ActionsController", () => {
  const mockService = {
    findAllByProject: jest.fn(),
    create: jest.fn(),
    getActionStatistics: jest.fn(),
    getActionRecordStatistics: jest.fn(),
    findRecord: jest.fn(),
    findRecordsByAction: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createRecordByProjectKey: jest.fn(),
    getStatus: jest.fn(),
  }

  let controller: ActionsController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new ActionsController(mockService as never)
  })

  it("findAllByProject delegates projectKey and query", async () => {
    const result = { total: 2, data: [] }
    mockService.findAllByProject.mockResolvedValue(result)
    expect(await controller.findAllByProject("proj", { limit: 10 } as never)).toBe(result)
    expect(mockService.findAllByProject).toHaveBeenCalledWith("proj", { limit: 10 })
  })

  it("create delegates dto", async () => {
    const dto = { project_key: "proj", name: "test" }
    mockService.create.mockResolvedValue({ action_id: "a1" })
    expect(await controller.create(dto as never)).toEqual({ action_id: "a1" })
  })

  it("getActionStatistics delegates", async () => {
    mockService.getActionStatistics.mockResolvedValue({ count: 5 })
    expect(await controller.getActionStatistics()).toEqual({ count: 5 })
  })

  it("getActionRecordStatistics delegates", async () => {
    mockService.getActionRecordStatistics.mockResolvedValue({ count: 20 })
    expect(await controller.getActionRecordStatistics()).toEqual({ count: 20 })
  })

  it("findRecord delegates recordId", async () => {
    mockService.findRecord.mockResolvedValue({ action_record_id: "r1" })
    expect(await controller.findRecord("r1")).toEqual({ action_record_id: "r1" })
  })

  it("findRecordsByAction delegates actionId and query", async () => {
    const result = { total: 3, data: [] }
    mockService.findRecordsByAction.mockResolvedValue(result)
    expect(await controller.findRecordsByAction("a1", { limit: 5 } as never)).toBe(result)
  })

  it("update delegates actionId and dto", async () => {
    const dto = { name: "updated" }
    mockService.update.mockResolvedValue({ action_id: "a1", name: "updated" })
    expect(await controller.update("a1", dto as never)).toEqual({
      action_id: "a1",
      name: "updated",
    })
  })

  it("remove delegates actionId and returns success", async () => {
    mockService.remove.mockResolvedValue(undefined)
    expect(await controller.remove("a1")).toEqual({ success: true })
  })

  it("createRecordByProjectKey passes httpPayload from request", async () => {
    const dto = { action_id: "a1" }
    const request = {
      method: "POST",
      headers: { "user-agent": "TestAgent/1.0" },
      body: { some: "data" },
    }
    mockService.createRecordByProjectKey.mockResolvedValue({ action_record_id: "r1" })

    await controller.createRecordByProjectKey("proj", dto as never, request as never)

    expect(mockService.createRecordByProjectKey).toHaveBeenCalledWith("proj", dto, {
      method: "POST",
      ua: "TestAgent/1.0",
      header: request.headers,
      body: { some: "data" },
    })
  })

  it("createRecordByProjectKey handles missing method and user-agent", async () => {
    const dto = { action_id: "a1" }
    const request = { headers: {}, body: undefined }
    mockService.createRecordByProjectKey.mockResolvedValue({ action_record_id: "r1" })

    await controller.createRecordByProjectKey("proj", dto as never, request as never)

    expect(mockService.createRecordByProjectKey).toHaveBeenCalledWith("proj", dto, {
      method: null,
      ua: null,
      header: {},
      body: null,
    })
  })

  it("getModuleStatus returns status", () => {
    mockService.getStatus.mockReturnValue({ module: "actions", implemented: true })
    expect(controller.getModuleStatus()).toEqual({ module: "actions", implemented: true })
  })
})
