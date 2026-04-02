import { VersionsStatsController } from "./versions-stats.controller"

describe("VersionsStatsController", () => {
  it("delegates getStatistics to versions service", async () => {
    const mockService = { getStatistics: jest.fn().mockResolvedValue({ count: 42 }) }
    const controller = new VersionsStatsController(mockService as never)

    expect(await controller.getStatistics()).toEqual({ count: 42 })
    expect(mockService.getStatistics).toHaveBeenCalled()
  })
})
