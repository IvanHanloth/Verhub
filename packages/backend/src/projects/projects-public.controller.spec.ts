import { ProjectsPublicController } from "./projects-public.controller"

describe("ProjectsPublicController", () => {
  const mockService = {
    findOneByProjectKey: jest.fn(),
  }

  let controller: ProjectsPublicController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new ProjectsPublicController(mockService as never)
  })

  it("findOneByProjectKey delegates to service", async () => {
    const project = { project_key: "my-app", name: "My App" }
    mockService.findOneByProjectKey.mockResolvedValue(project)

    expect(await controller.findOneByProjectKey("my-app")).toBe(project)
    expect(mockService.findOneByProjectKey).toHaveBeenCalledWith("my-app")
  })
})
