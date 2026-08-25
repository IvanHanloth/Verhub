import { NotFoundException } from "@nestjs/common"
import { Platform } from "@prisma/client"

import { EventsIngestService } from "./events-ingest.service"
import type { ClientOrigin } from "../geo/client-origin.service"
import type { IngestEventsDto } from "./dto/ingest-events.dto"

const ORIGIN: ClientOrigin = {
  ip: "203.0.113.7",
  userAgent: "verhub-sdk-js/1.0.0",
  countryCode: "CN",
  countryName: "中国",
  regionName: "广东省",
  city: "深圳",
  platform: Platform.WINDOWS,
  platformVersion: "11",
}

function createPrismaMock() {
  return {
    project: { findUnique: jest.fn().mockResolvedValue({ eventCollectionEnabled: true }) },
    eventRecord: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    eventActiveUser: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  }
}

function createResolver() {
  return { resolveCanonicalKeyOrThrow: jest.fn().mockResolvedValue("demo") }
}

function build(prisma = createPrismaMock(), resolver = createResolver()) {
  return {
    prisma,
    resolver,
    service: new EventsIngestService(prisma as never, resolver as never),
  }
}

function dto(overrides: Partial<IngestEventsDto> = {}): IngestEventsDto {
  return {
    distinct_id: "user-1",
    session_id: "session-1",
    events: [
      { event_id: "e1", name: "checkout_clicked", occurred_at: 1_760_000_000 },
      { event_id: "e2", name: "checkout_clicked", occurred_at: 1_760_000_010 },
    ],
    ...overrides,
  } as IngestEventsDto
}

/** 从 $executeRaw 的调用里挑出打到某张表的那些。 */
function rawCallsFor(prisma: ReturnType<typeof createPrismaMock>, table: string) {
  return prisma.$executeRaw.mock.calls.filter((call) => {
    const strings = call[0] as { raw?: string[] } | string[] as string[]
    return (Array.isArray(strings) ? strings.join("") : String(strings)).includes(`"${table}"`)
  })
}

describe("EventsIngestService.ingest", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(1_760_000_100 * 1000)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("writes nothing at all when the client sent the opt-out signal", async () => {
    const { service, prisma } = build()

    const result = await service.ingest("demo", dto(), ORIGIN, true)

    expect(result).toEqual({ accepted: 0, skipped: 2, suppressed: true })
    expect(prisma.eventRecord.createMany).not.toHaveBeenCalled()
    expect(prisma.$executeRaw).not.toHaveBeenCalled()
  })

  it("writes nothing when the project switched event collection off", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue({ eventCollectionEnabled: false })
    const { service } = build(prisma)

    const result = await service.ingest("demo", dto(), ORIGIN, false)

    expect(result).toEqual({ accepted: 0, skipped: 2, suppressed: true })
    expect(prisma.eventRecord.createMany).not.toHaveBeenCalled()
  })

  it("rejects an unknown project", async () => {
    const prisma = createPrismaMock()
    prisma.project.findUnique.mockResolvedValue(null)
    const { service } = build(prisma)

    await expect(service.ingest("demo", dto(), ORIGIN, false)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("stores an anonymized IP while keeping the geo columns resolved from the full address", async () => {
    const prisma = createPrismaMock()
    prisma.eventRecord.createMany.mockResolvedValue({ count: 2 })
    const { service } = build(prisma)

    await service.ingest("demo", dto(), ORIGIN, false)

    const rows = prisma.eventRecord.createMany.mock.calls[0]![0].data as Array<
      Record<string, unknown>
    >
    expect(rows[0]!.ip).toBe("203.0.113.0")
    // 归属地在 ClientOriginService 里已用完整地址解析完，精度不受截断影响。
    expect(rows[0]!.city).toBe("深圳")
    expect(rows[0]!.countryCode).toBe("CN")
  })

  it("relies on the idempotency key rather than re-checking for duplicates", async () => {
    const prisma = createPrismaMock()
    prisma.eventRecord.createMany.mockResolvedValue({ count: 2 })
    const { service } = build(prisma)

    await service.ingest("demo", dto(), ORIGIN, false)

    expect(prisma.eventRecord.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    )
  })

  it("skips an event whose name is not usable without failing the rest of the batch", async () => {
    const prisma = createPrismaMock()
    prisma.eventRecord.createMany.mockResolvedValue({ count: 1 })
    const { service } = build(prisma)

    await service.ingest(
      "demo",
      dto({
        events: [
          { event_id: "e1", name: "checkout clicked" },
          { event_id: "e2", name: "checkout_clicked" },
        ],
      } as Partial<IngestEventsDto>),
      ORIGIN,
      false,
    )

    const rows = prisma.eventRecord.createMany.mock.calls[0]![0].data as Array<
      Record<string, unknown>
    >
    expect(rows).toHaveLength(1)
    expect(rows[0]!.eventName).toBe("checkout_clicked")
  })

  it("reports every event as skipped when none of the names survive normalization", async () => {
    const prisma = createPrismaMock()
    const { service } = build(prisma)

    const result = await service.ingest(
      "demo",
      dto({ events: [{ event_id: "e1", name: "结算" }] } as Partial<IngestEventsDto>),
      ORIGIN,
      false,
    )

    expect(result).toEqual({ accepted: 0, skipped: 1, suppressed: false })
    expect(prisma.eventRecord.createMany).not.toHaveBeenCalled()
  })

  it("does not touch the rollups when the whole batch was a duplicate replay", async () => {
    const prisma = createPrismaMock()
    prisma.eventRecord.createMany.mockResolvedValue({ count: 0 })
    const { service } = build(prisma)

    const result = await service.ingest("demo", dto(), ORIGIN, false)

    // 重试补发不能把计数翻倍。
    expect(result.accepted).toBe(0)
    expect(prisma.$executeRaw).not.toHaveBeenCalled()
  })

  it("folds the batch into one rollup upsert per (event, hour) instead of one per event", async () => {
    const prisma = createPrismaMock()
    prisma.eventRecord.createMany.mockResolvedValue({ count: 2 })
    const { service } = build(prisma)

    // 两条同名事件落在同一个小时桶里。
    await service.ingest("demo", dto(), ORIGIN, false)
    await Promise.resolve()
    await Promise.resolve()

    // 同一条语句里两行撞上同一个冲突目标会被 Postgres 拒绝，所以必须先在内存里聚合。
    expect(rawCallsFor(prisma, "EventStat")).toHaveLength(1)
  })

  it("clamps a client timestamp from a broken clock to the receive time", async () => {
    const prisma = createPrismaMock()
    prisma.eventRecord.createMany.mockResolvedValue({ count: 1 })
    const { service } = build(prisma)

    await service.ingest(
      "demo",
      dto({
        events: [{ event_id: "e1", name: "checkout_clicked", occurred_at: 4_000_000_000 }],
      } as Partial<IngestEventsDto>),
      ORIGIN,
      false,
    )

    const rows = prisma.eventRecord.createMany.mock.calls[0]![0].data as Array<
      Record<string, unknown>
    >
    expect(rows[0]!.occurredAt).toBe(1_760_000_100)
  })
})

describe("EventsIngestService.deleteSubject", () => {
  it("deletes detail and daily-unique rows but leaves the hourly rollup alone", async () => {
    const prisma = createPrismaMock()
    prisma.eventRecord.deleteMany.mockResolvedValue({ count: 12 })
    const { service } = build(prisma)

    const result = await service.deleteSubject("demo", "user-1")

    expect(result).toEqual({ deleted: 12 })
    expect(prisma.eventRecord.deleteMany).toHaveBeenCalledWith({
      where: { projectKey: "demo", distinctId: "user-1" },
    })
    expect(prisma.eventActiveUser.deleteMany).toHaveBeenCalledWith({
      where: { projectKey: "demo", distinctId: "user-1" },
    })
    // EventStat 是纯计数、不含标识符，按 GDPR Recital 26 属于匿名数据，不在删除范围内。
    expect(rawCallsFor(prisma, "EventStat")).toHaveLength(0)
  })
})
