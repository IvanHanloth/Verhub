import { AnnouncementsStatsController } from "./announcements-stats.controller"

describe("AnnouncementsStatsController", () => {
  it("delegates getStatistics to announcements service", async () => {
    const mockService = {
      getStatistics: jest.fn().mockResolvedValue({ count: 10, pinned_count: 2 }),
    }
    const controller = new AnnouncementsStatsController(mockService as never)

    expect(await controller.getStatistics()).toEqual({ count: 10, pinned_count: 2 })
  })
})
