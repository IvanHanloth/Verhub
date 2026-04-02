import { ProjectsController } from "./projects.controller"

describe("ProjectsController", () => {
  const mockService = {
    findAll: jest.fn(),
    getStatistics: jest.fn(),
    previewFromGithubRepo: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getStatus: jest.fn(),
  }

  let controller: ProjectsController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new ProjectsController(mockService as never)
  })

  it("findAll delegates query to service", async () => {
    const query = { limit: 10, offset: 0 }
    const expected = { total: 1, data: [] }
    mockService.findAll.mockResolvedValue(expected)

    expect(await controller.findAll(query as never)).toBe(expected)
    expect(mockService.findAll).toHaveBeenCalledWith(query)
  })

  it("getStatistics delegates to service", async () => {
    mockService.getStatistics.mockResolvedValue({ count: 5 })
    expect(await controller.getStatistics()).toEqual({ count: 5 })
  })

  it("previewFromGithubRepo delegates repo_url", async () => {
    const expected = { name: "my-repo" }
    mockService.previewFromGithubRepo.mockResolvedValue(expected)
    expect(
      await controller.previewFromGithubRepo({ repo_url: "https://github.com/a/b" } as never),
    ).toBe(expected)
    expect(mockService.previewFromGithubRepo).toHaveBeenCalledWith("https://github.com/a/b")
  })

  it("findOne delegates projectKey", async () => {
    mockService.findOne.mockResolvedValue({ project_key: "app" })
    expect(await controller.findOne("app")).toEqual({ project_key: "app" })
  })

  it("create delegates dto", async () => {
    const dto = { project_key: "new-app", name: "New App" }
    mockService.create.mockResolvedValue({ project_key: "new-app" })
    await controller.create(dto as never)
    expect(mockService.create).toHaveBeenCalledWith(dto)
  })

  it("update delegates projectKey and dto", async () => {
    const dto = { name: "Updated" }
    mockService.update.mockResolvedValue({ project_key: "app" })
    await controller.update("app", dto as never)
    expect(mockService.update).toHaveBeenCalledWith("app", dto)
  })

  it("remove delegates projectKey and returns success", async () => {
    mockService.remove.mockResolvedValue(undefined)
    expect(await controller.remove("app")).toEqual({ success: true })
  })

  it("getModuleStatus delegates to service", () => {
    mockService.getStatus.mockReturnValue({ module: "projects", implemented: true })
    expect(controller.getModuleStatus()).toEqual({ module: "projects", implemented: true })
  })
})
