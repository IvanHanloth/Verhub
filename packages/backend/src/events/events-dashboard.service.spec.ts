import { BadRequestException, NotFoundException } from "@nestjs/common"

import { EventsDashboardService } from "./events-dashboard.service"

function createPrismaMock() {
  return {
    eventDashboardCard: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  }
}

function build(prisma = createPrismaMock()) {
  const resolver = { resolveCanonicalKeyOrThrow: jest.fn().mockResolvedValue("demo") }
  return { prisma, service: new EventsDashboardService(prisma as never, resolver as never) }
}

const VALID_QUERY = {
  type: "value",
  events: [
    { name: "checkout_completed", alias: "A", measure: "unique_users" },
    { name: "cart_viewed", alias: "B", measure: "unique_users" },
  ],
  formula: "A / B * 100",
}

describe("EventsDashboardService.create", () => {
  it("stores a card whose query is a valid metric DSL", async () => {
    const { prisma, service } = build()
    prisma.eventDashboardCard.create.mockResolvedValue({
      id: "card-1",
      projectKey: "demo",
      title: "结算转化率",
      description: null,
      query: VALID_QUERY,
      layout: null,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    })

    const card = await service.create("demo", { title: "结算转化率", query: VALID_QUERY } as never)

    expect(card.card_id).toBe("card-1")
    expect(prisma.eventDashboardCard.create).toHaveBeenCalled()
  })

  it("rejects a structurally invalid query at write time", async () => {
    // 存坏的卡片会在每次打开看板时炸一遍，且没人知道是哪张。
    const { prisma, service } = build()

    await expect(
      service.create("demo", { title: "坏卡片", query: { type: "nope", events: [] } } as never),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.eventDashboardCard.create).not.toHaveBeenCalled()
  })

  it("rejects a query whose alias is not a single uppercase letter", async () => {
    const { service } = build()

    await expect(
      service.create("demo", {
        title: "坏别名",
        query: { type: "value", events: [{ name: "a", alias: "total" }] },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("rejects a formula that is not valid arithmetic", async () => {
    const { service } = build()

    await expect(
      service.create("demo", {
        title: "坏公式",
        query: { ...VALID_QUERY, formula: "process.exit(1)" },
      } as never),
    ).rejects.toThrow(/公式不合法/)
  })

  it("rejects a formula referencing an alias the card does not define", async () => {
    const { service } = build()

    await expect(
      service.create("demo", {
        title: "悬空别名",
        query: { ...VALID_QUERY, formula: "A / Z" },
      } as never),
    ).rejects.toThrow(/公式不合法/)
  })
})

describe("EventsDashboardService.update / remove", () => {
  it("404s on a card that does not exist", async () => {
    const { service } = build()

    await expect(service.update("missing", { title: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    await expect(service.remove("missing")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("re-validates the query when one is supplied", async () => {
    const { prisma, service } = build()
    prisma.eventDashboardCard.findUnique.mockResolvedValue({ id: "card-1" })

    await expect(
      service.update("card-1", { query: { type: "value", events: [] } } as never),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.eventDashboardCard.update).not.toHaveBeenCalled()
  })
})
