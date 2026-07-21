import { BadRequestException } from "@nestjs/common"

import { QueryClientVersionStatsDto, QueryRequestStatsDto } from "./dto/query-request-stats.dto"
import { RequestStatsController } from "./request-stats.controller"

function createService() {
  return {
    getClientVersionBreakdown: jest.fn(),
    getHeatmap: jest.fn(),
  }
}

function versionQuery(overrides: Partial<QueryClientVersionStatsDto> = {}) {
  return Object.assign(new QueryClientVersionStatsDto(), {
    start_time: 100,
    end_time: 200,
    ...overrides,
  })
}

describe("RequestStatsController.getClientVersions", () => {
  it("returns the range, the untruncated total, and the version rows", async () => {
    const service = createService()
    service.getClientVersionBreakdown.mockResolvedValue({
      total: 100,
      buckets: [
        { version: "2.3.0", count: 60 },
        { version: "2.2.1", count: 25 },
      ],
    })
    const controller = new RequestStatsController(service as never)

    await expect(controller.getClientVersions("verhub", versionQuery())).resolves.toEqual({
      start_time: 100,
      end_time: 200,
      total: 100,
      data: [
        { version: "2.3.0", count: 60 },
        { version: "2.2.1", count: 25 },
      ],
    })
  })

  it("passes the requested limit through to the service", async () => {
    const service = createService()
    service.getClientVersionBreakdown.mockResolvedValue({ total: 0, buckets: [] })
    const controller = new RequestStatsController(service as never)

    await controller.getClientVersions("verhub", versionQuery({ limit: 5 }))

    expect(service.getClientVersionBreakdown).toHaveBeenCalledWith(
      "verhub",
      { startTime: 100, endTime: 200 },
      5,
    )
  })

  it("rejects an inverted range", async () => {
    const service = createService()
    const controller = new RequestStatsController(service as never)

    await expect(
      controller.getClientVersions("verhub", versionQuery({ start_time: 500, end_time: 100 })),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe("RequestStatsController.getHeatmap", () => {
  it("returns the cells the service produced", async () => {
    const service = createService()
    service.getHeatmap.mockResolvedValue([{ weekday: 1, hour: 9, count: 12 }])
    const controller = new RequestStatsController(service as never)
    const query = Object.assign(new QueryRequestStatsDto(), { start_time: 100, end_time: 200 })

    await expect(controller.getHeatmap("verhub", query)).resolves.toEqual({
      start_time: 100,
      end_time: 200,
      data: [{ weekday: 1, hour: 9, count: 12 }],
    })
  })
})
