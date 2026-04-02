import { VersionsPublicController } from "./versions-public.controller"

describe("VersionsPublicController", () => {
  const mockVersionsService = {
    findAllByProjectKey: jest.fn(),
    findLatestByProjectKey: jest.fn(),
    findLatestPreviewByProjectKey: jest.fn(),
    findByVersionNumber: jest.fn(),
  }
  const mockUpdateCheckService = {
    checkUpdateByProjectKey: jest.fn(),
  }

  let controller: VersionsPublicController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new VersionsPublicController(
      mockVersionsService as never,
      mockUpdateCheckService as never,
    )
  })

  it("findAllByProjectKey delegates projectKey and query", async () => {
    const result = { total: 2, data: [] }
    mockVersionsService.findAllByProjectKey.mockResolvedValue(result)

    expect(await controller.findAllByProjectKey("proj", { limit: 10 } as never)).toBe(result)
    expect(mockVersionsService.findAllByProjectKey).toHaveBeenCalledWith("proj", { limit: 10 })
  })

  it("findLatestByProjectKey delegates projectKey", async () => {
    const version = { version: "2.0.0" }
    mockVersionsService.findLatestByProjectKey.mockResolvedValue(version)
    expect(await controller.findLatestByProjectKey("proj")).toBe(version)
  })

  it("findLatestPreviewByProjectKey delegates projectKey", async () => {
    const version = { version: "3.0.0-rc.1" }
    mockVersionsService.findLatestPreviewByProjectKey.mockResolvedValue(version)
    expect(await controller.findLatestPreviewByProjectKey("proj")).toBe(version)
  })

  it("findOneByVersion decodes URI component and delegates", async () => {
    const version = { version: "1.0.0" }
    mockVersionsService.findByVersionNumber.mockResolvedValue(version)

    expect(await controller.findOneByVersion("proj", "1.0.0")).toBe(version)
    expect(mockVersionsService.findByVersionNumber).toHaveBeenCalledWith("proj", "1.0.0")
  })

  it("findOneByVersion decodes encoded version strings", async () => {
    mockVersionsService.findByVersionNumber.mockResolvedValue({})
    await controller.findOneByVersion("proj", "1.0.0%2Bbuild")
    expect(mockVersionsService.findByVersionNumber).toHaveBeenCalledWith("proj", "1.0.0+build")
  })

  it("checkUpdate delegates projectKey and dto", async () => {
    const dto = { current_version: "1.0.0" }
    const result = { should_update: true }
    mockUpdateCheckService.checkUpdateByProjectKey.mockResolvedValue(result)

    expect(await controller.checkUpdate("proj", dto as never)).toBe(result)
    expect(mockUpdateCheckService.checkUpdateByProjectKey).toHaveBeenCalledWith("proj", dto)
  })
})
