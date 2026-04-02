import { VersionsCompatController } from "./versions-compat.controller"

describe("VersionsCompatController", () => {
  const mockService = {
    createByProjectKey: jest.fn(),
    findOneById: jest.fn(),
    updateById: jest.fn(),
    removeById: jest.fn(),
  }

  let controller: VersionsCompatController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new VersionsCompatController(mockService as never)
  })

  it("createByProjectKey delegates project_key from dto", async () => {
    const dto = { project_key: "my-app", version: "1.0.0" }
    mockService.createByProjectKey.mockResolvedValue({ id: "v1" })

    await controller.createByProjectKey(dto as never)
    expect(mockService.createByProjectKey).toHaveBeenCalledWith("my-app", dto)
  })

  it("findOneById delegates version_id", async () => {
    mockService.findOneById.mockResolvedValue({ id: "v1", version: "1.0.0" })
    expect(await controller.findOneById("v1")).toEqual({ id: "v1", version: "1.0.0" })
  })

  it("updateById delegates version_id and dto", async () => {
    const dto = { title: "Updated" }
    mockService.updateById.mockResolvedValue({ id: "v1" })
    await controller.updateById("v1", dto as never)
    expect(mockService.updateById).toHaveBeenCalledWith("v1", dto)
  })

  it("removeById delegates and returns success", async () => {
    mockService.removeById.mockResolvedValue(undefined)
    expect(await controller.removeById("v1")).toEqual({ success: true })
  })
})
