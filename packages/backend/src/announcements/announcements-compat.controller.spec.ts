import { AnnouncementsCompatController } from "./announcements-compat.controller"

describe("AnnouncementsCompatController", () => {
  const mockService = {
    createByProjectKey: jest.fn(),
    updateById: jest.fn(),
    removeById: jest.fn(),
  }

  let controller: AnnouncementsCompatController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new AnnouncementsCompatController(mockService as never)
  })

  it("createByProjectKey delegates project_key from dto", async () => {
    const dto = { project_key: "my-app", title: "Hello" }
    mockService.createByProjectKey.mockResolvedValue({ id: "a1" })
    await controller.createByProjectKey(dto as never)
    expect(mockService.createByProjectKey).toHaveBeenCalledWith("my-app", dto)
  })

  it("updateById delegates announcement_id and dto", async () => {
    const dto = { title: "Updated" }
    mockService.updateById.mockResolvedValue({ id: "a1" })
    await controller.updateById("a1", dto as never)
    expect(mockService.updateById).toHaveBeenCalledWith("a1", dto)
  })

  it("removeById delegates and returns success", async () => {
    mockService.removeById.mockResolvedValue(undefined)
    expect(await controller.removeById("a1")).toEqual({ success: true })
  })
})
