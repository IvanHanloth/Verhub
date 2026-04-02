import { AnnouncementsPublicController } from "./announcements-public.controller"

describe("AnnouncementsPublicController", () => {
  const mockService = {
    findAllByProjectKey: jest.fn(),
    findLatestByProjectKey: jest.fn(),
  }

  let controller: AnnouncementsPublicController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new AnnouncementsPublicController(mockService as never)
  })

  it("findAllByProjectKey delegates projectKey and query", async () => {
    const result = { total: 2, data: [] }
    mockService.findAllByProjectKey.mockResolvedValue(result)
    expect(await controller.findAllByProjectKey("proj", {} as never)).toBe(result)
    expect(mockService.findAllByProjectKey).toHaveBeenCalledWith("proj", {})
  })

  it("findLatestByProjectKey delegates projectKey and query", async () => {
    const announcement = { id: "a1", title: "Latest" }
    mockService.findLatestByProjectKey.mockResolvedValue(announcement)
    expect(await controller.findLatestByProjectKey("proj", {} as never)).toBe(announcement)
    expect(mockService.findLatestByProjectKey).toHaveBeenCalledWith("proj", {})
  })
})
