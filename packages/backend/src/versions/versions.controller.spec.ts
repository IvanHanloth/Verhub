import { VersionsController } from "./versions.controller"

describe("VersionsController", () => {
  const mockVersionsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getStatus: jest.fn(),
  }
  const mockGithubReleaseService = {
    previewFromGithubRelease: jest.fn(),
    importFromGithubReleases: jest.fn(),
  }

  let controller: VersionsController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new VersionsController(
      mockVersionsService as never,
      mockGithubReleaseService as never,
    )
  })

  it("findAll delegates projectKey and query", async () => {
    const result = { total: 5, data: [] }
    mockVersionsService.findAll.mockResolvedValue(result)

    expect(await controller.findAll("proj", { limit: 10 } as never)).toBe(result)
    expect(mockVersionsService.findAll).toHaveBeenCalledWith("proj", { limit: 10 })
  })

  it("getModuleStatus delegates to service", () => {
    mockVersionsService.getStatus.mockReturnValue({ module: "versions", implemented: true })
    expect(controller.getModuleStatus()).toEqual({ module: "versions", implemented: true })
  })

  it("previewFromGithubRelease delegates projectKey and query", async () => {
    const preview = { version: "1.0.0" }
    mockGithubReleaseService.previewFromGithubRelease.mockResolvedValue(preview)

    const query = { tag: "v1.0.0" }
    expect(await controller.previewFromGithubRelease("proj", query as never)).toBe(preview)
    expect(mockGithubReleaseService.previewFromGithubRelease).toHaveBeenCalledWith("proj", query)
  })

  it("importFromGithubRelease delegates projectKey", async () => {
    const result = { imported: 3, skipped: 1, scanned: 4 }
    mockGithubReleaseService.importFromGithubReleases.mockResolvedValue(result)

    expect(await controller.importFromGithubRelease("proj")).toBe(result)
  })

  it("findOne delegates projectKey and id", async () => {
    const version = { id: "v1", version: "1.0.0" }
    mockVersionsService.findOne.mockResolvedValue(version)

    expect(await controller.findOne("proj", "v1")).toBe(version)
    expect(mockVersionsService.findOne).toHaveBeenCalledWith("proj", "v1")
  })

  it("create delegates projectKey and dto", async () => {
    const dto = { version: "2.0.0" }
    mockVersionsService.create.mockResolvedValue({ id: "v2" })

    await controller.create("proj", dto as never)
    expect(mockVersionsService.create).toHaveBeenCalledWith("proj", dto)
  })

  it("update delegates projectKey, id, and dto", async () => {
    const dto = { title: "Updated" }
    mockVersionsService.update.mockResolvedValue({ id: "v1" })

    await controller.update("proj", "v1", dto as never)
    expect(mockVersionsService.update).toHaveBeenCalledWith("proj", "v1", dto)
  })

  it("remove delegates and returns success", async () => {
    mockVersionsService.remove.mockResolvedValue(undefined)
    expect(await controller.remove("proj", "v1")).toEqual({ success: true })
  })
})
