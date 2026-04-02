import { FeedbacksCompatController } from "./feedbacks-compat.controller"

describe("FeedbacksCompatController", () => {
  const mockService = {
    updateById: jest.fn(),
    removeById: jest.fn(),
  }

  let controller: FeedbacksCompatController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new FeedbacksCompatController(mockService as never)
  })

  it("updateById delegates feedback_id and dto", async () => {
    const dto = { content: "updated" }
    mockService.updateById.mockResolvedValue({ id: "f1" })
    await controller.updateById("f1", dto as never)
    expect(mockService.updateById).toHaveBeenCalledWith("f1", dto)
  })

  it("removeById delegates and returns success", async () => {
    mockService.removeById.mockResolvedValue(undefined)
    expect(await controller.removeById("f1")).toEqual({ success: true })
  })
})
