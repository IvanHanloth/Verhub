import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"

import { PrismaService } from "../database/prisma.service"
import { ProjectResolverService } from "../database/project-resolver.service"
import { DAY_SECONDS, floorTo, type StatsRange } from "../stats/bucket-utils"
import { andAll, compileFilters } from "./dsl/compile"
import type { QueryFunnelDto, QueryPathsDto, QueryRetentionDto } from "./dto/query-events.dto"

export type FunnelStepResult = {
  step: number
  event_name: string
  /** 走到这一步的独立标识数。 */
  users: number
  /** 相对上一步的转化率，第一步恒为 1。 */
  conversion_rate: number
  /** 相对第一步的累计转化率。 */
  total_conversion_rate: number
  /** 在这一步流失的人数。 */
  dropped: number
}

export type RetentionCell = {
  /** 距离起始周期的周期数，0 是当期。 */
  period: number
  users: number
  rate: number
}

export type RetentionCohort = {
  /** 队列起始时间（Unix 秒，已按 tz 折算到当地周期起点）。 */
  cohort: number
  size: number
  /**
   * 每个周期一格。尚未走完的周期返回 null 而不是 0——把还没发生的时间显示成
   * 0% 留存是不诚实的，会让人以为产品在那天掉光了用户。
   */
  cells: Array<RetentionCell | null>
}

export type PathEdge = {
  step: number
  from_event: string
  to_event: string
  count: number
}

/**
 * 跨事件的组合分析。
 *
 * 这三种分析全部只能走明细表 EventRecord：小时汇总丢掉了 distinctId 维度，
 * 而「同一个人是否依次做了 A 再做 B」正是它们要回答的问题。主力索引是
 * [projectKey, distinctId, occurredAt]。
 */
@Injectable()
export class EventsAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectResolver: ProjectResolverService,
  ) {}

  /**
   * 漏斗转化。
   *
   * 逐步 LATERAL 取「上一步之后、且仍在转化窗口内的最早一条」。窗口锚定在第一步
   * 而不是相邻两步：业务上说的「7 天内完成下单」算的是从进入漏斗起的总时长。
   *
   * 每一步的子查询在上一步为 NULL 时自然也得到 NULL（与 NULL 比较不产生行），
   * 所以中途流失的人不必显式排除。
   */
  async getFunnel(
    projectKey: string,
    range: StatsRange,
    query: QueryFunnelDto,
  ): Promise<{ steps: FunnelStepResult[] }> {
    const key = await this.resolveProjectKey(projectKey)
    const steps = query.steps
    const firstStep = steps[0]
    if (!firstStep) {
      return { steps: [] }
    }

    // 第一步：每个标识在区间内第一次命中的时间，作为整条漏斗的锚点。
    let cte = Prisma.sql`
      s1 AS (
        SELECT "distinctId", MIN("occurredAt") AS t1
        FROM "EventRecord"
        WHERE "projectKey" = ${key}
          AND "eventName" = ${firstStep.event_name}
          AND "occurredAt" >= ${range.startTime}
          AND "occurredAt" <= ${range.endTime}
          AND ${andAll(compileFilters(firstStep.filters))}
        GROUP BY "distinctId"
      )`

    for (let index = 1; index < steps.length; index += 1) {
      const step = steps[index]
      if (!step) {
        continue
      }
      const current = index + 1
      const previous = Prisma.raw(`s${index}`)
      const previousTime = Prisma.raw(`t${index}`)
      const currentTime = Prisma.raw(`t${current}`)
      const alias = Prisma.raw(`s${current}`)

      cte = Prisma.sql`${cte},
      ${alias} AS (
        SELECT ${previous}.*, (
          SELECT MIN(e."occurredAt")
          FROM "EventRecord" e
          WHERE e."projectKey" = ${key}
            AND e."eventName" = ${step.event_name}
            AND e."distinctId" = ${previous}."distinctId"
            AND e."occurredAt" >= ${previous}.${previousTime}
            AND e."occurredAt" <= LEAST(${previous}.t1 + ${query.window_seconds}, ${range.endTime})
            AND ${andAll(compileFilters(step.filters, "e"))}
        ) AS ${currentTime}
        FROM ${previous}
      )`
    }

    // SELECT COUNT(t1) AS c1, COUNT(t2) AS c2, ... —— 每一步有多少人走到。
    // COUNT 跳过 NULL，而中途流失的人在该步及之后都是 NULL，所以不必显式排除。
    const selectList = steps
      .map(
        (_, index) =>
          Prisma.sql`COUNT(${Prisma.raw(`t${index + 1}`)}) AS ${Prisma.raw(`c${index + 1}`)}`,
      )
      .reduce((left, right) => Prisma.sql`${left}, ${right}`)
    const last = Prisma.raw(`s${steps.length}`)

    const rows = await this.prisma.$queryRaw<Array<Record<string, bigint>>>`
      WITH ${cte}
      SELECT ${selectList} FROM ${last}
    `

    const row = rows[0] ?? {}
    const users = steps.map((_, index) => Number(row[`c${index + 1}`] ?? 0))
    const first = users[0] ?? 0

    return {
      steps: steps.map((step, index) => {
        const current = users[index] ?? 0
        const previous = index === 0 ? current : (users[index - 1] ?? 0)
        return {
          step: index + 1,
          event_name: step.event_name,
          users: current,
          conversion_rate: previous === 0 ? 0 : current / previous,
          total_conversion_rate: first === 0 ? 0 : current / first,
          dropped: index === 0 ? 0 : previous - current,
        }
      }),
    }
  }

  /**
   * 留存矩阵。
   *
   * 队列按「首次命中起始事件」的当地周期划分，回访按 `return_event`（不传则任意
   * 事件都算）。周期边界按查询者时区折算而不是 UTC——同趋势图日桶的理由。
   */
  async getRetention(
    projectKey: string,
    range: StatsRange,
    query: QueryRetentionDto,
  ): Promise<{ period: "day" | "week"; periods: number; cohorts: RetentionCohort[] }> {
    const key = await this.resolveProjectKey(projectKey)
    const periodSeconds = query.period === "week" ? DAY_SECONDS * 7 : DAY_SECONDS
    const shift = query.tz_offset_minutes * 60

    const returnCondition = query.return_event
      ? Prisma.sql`AND e."eventName" = ${query.return_event}`
      : Prisma.empty

    const rows = await this.prisma.$queryRaw<
      Array<{ cohort: bigint; period: bigint; users: bigint }>
    >`
      WITH first_seen AS (
        SELECT "distinctId", MIN("occurredAt") AS t
        FROM "EventRecord"
        WHERE "projectKey" = ${key}
          AND "eventName" = ${query.start_event}
          AND "occurredAt" >= ${range.startTime}
          AND "occurredAt" <= ${range.endTime}
        GROUP BY "distinctId"
      ),
      cohort AS (
        SELECT
          "distinctId",
          (FLOOR((t + ${shift})::numeric / ${periodSeconds}) * ${periodSeconds} - ${shift})::bigint AS c
        FROM first_seen
      ),
      activity AS (
        SELECT DISTINCT
          e."distinctId",
          (FLOOR((e."occurredAt" + ${shift})::numeric / ${periodSeconds}) * ${periodSeconds} - ${shift})::bigint AS d
        FROM "EventRecord" e
        WHERE e."projectKey" = ${key}
          AND e."occurredAt" >= ${range.startTime}
          AND e."occurredAt" <= ${range.endTime}
          ${returnCondition}
      )
      SELECT
        cohort.c AS cohort,
        ((activity.d - cohort.c) / ${periodSeconds})::bigint AS period,
        COUNT(DISTINCT cohort."distinctId") AS users
      FROM cohort
      JOIN activity ON activity."distinctId" = cohort."distinctId" AND activity.d >= cohort.c
      GROUP BY 1, 2
      ORDER BY 1, 2
    `

    const byCohort = new Map<number, Map<number, number>>()
    for (const row of rows) {
      const cohort = Number(row.cohort)
      const buckets = byCohort.get(cohort) ?? new Map<number, number>()
      buckets.set(Number(row.period), Number(row.users))
      byCohort.set(cohort, buckets)
    }

    const firstCohort = floorTo(range.startTime, periodSeconds, shift)
    const lastCohort = floorTo(range.endTime, periodSeconds, shift)
    const cohorts: RetentionCohort[] = []

    for (let cohort = firstCohort; cohort <= lastCohort; cohort += periodSeconds) {
      const buckets = byCohort.get(cohort)
      const size = buckets?.get(0) ?? 0
      cohorts.push({
        cohort,
        size,
        cells: Array.from({ length: query.periods }, (_, period) => {
          // 该周期还没走完就没有可观测的留存，返回 null 让前端画成空格。
          if (cohort + period * periodSeconds > lastCohort) {
            return null
          }
          const users = buckets?.get(period) ?? 0
          return { period, users, rate: size === 0 ? 0 : users / size }
        }),
      })
    }

    return { period: query.period, periods: query.periods, cohorts }
  }

  /**
   * 事件序列的相邻转移，用于桑基图。
   *
   * 默认按会话串而不是按人：跨会话会把「昨天看了详情页、今天下了单」连成一条边，
   * 显示出用户从来没有连续做过的动作序列。没有会话标识的上报回退到按人串。
   */
  async getPaths(
    projectKey: string,
    range: StatsRange,
    query: QueryPathsDto,
  ): Promise<{ edges: PathEdge[]; truncated: boolean }> {
    const key = await this.resolveProjectKey(projectKey)

    const partition =
      query.scope === "user"
        ? Prisma.sql`"distinctId"`
        : Prisma.sql`COALESCE("sessionId", "distinctId")`

    // 指定起点时，只保留每条序列中首次命中起点之后的部分，让第 1 层就是起点本身。
    const anchored = query.start_event
      ? Prisma.sql`
        , anchored AS (
          SELECT * FROM ordered
          WHERE seq >= (
            SELECT MIN(inner_ordered.seq) FROM ordered inner_ordered
            WHERE inner_ordered.scope = ordered.scope
              AND inner_ordered."eventName" = ${query.start_event}
          )
        )`
      : Prisma.sql`, anchored AS (SELECT * FROM ordered)`

    const rows = await this.prisma.$queryRaw<
      Array<{ step: bigint; from_event: string; to_event: string; count: bigint }>
    >`
      WITH ordered AS (
        SELECT
          ${partition} AS scope,
          "eventName",
          ROW_NUMBER() OVER (PARTITION BY ${partition} ORDER BY "occurredAt", "id") AS seq
        FROM "EventRecord"
        WHERE "projectKey" = ${key}
          AND "occurredAt" >= ${range.startTime}
          AND "occurredAt" <= ${range.endTime}
      )
      ${anchored},
      numbered AS (
        SELECT
          scope,
          "eventName",
          ROW_NUMBER() OVER (PARTITION BY scope ORDER BY seq) AS step
        FROM anchored
      ),
      pairs AS (
        SELECT
          step,
          "eventName" AS from_event,
          LEAD("eventName") OVER (PARTITION BY scope ORDER BY step) AS to_event
        FROM numbered
        WHERE step <= ${query.depth}
      )
      SELECT step::bigint, from_event, to_event, COUNT(*) AS count
      FROM pairs
      WHERE to_event IS NOT NULL
      GROUP BY 1, 2, 3
      ORDER BY 1, count DESC
    `

    // 每层只保留分支最多的前 N 条，其余并成一条「其他」边——不并的话一个自由
    // 命名的事件空间会画出上百条几乎不可见的连线。
    const byStep = new Map<number, PathEdge[]>()
    for (const row of rows) {
      const step = Number(row.step)
      const edges = byStep.get(step) ?? []
      edges.push({
        step,
        from_event: row.from_event,
        to_event: row.to_event,
        count: Number(row.count),
      })
      byStep.set(step, edges)
    }

    const edges: PathEdge[] = []
    let truncated = false
    for (const [step, stepEdges] of [...byStep.entries()].sort((a, b) => a[0] - b[0])) {
      const kept = stepEdges.slice(0, query.branch_limit)
      const rest = stepEdges.slice(query.branch_limit)
      edges.push(...kept)
      if (rest.length) {
        truncated = true
        edges.push({
          step,
          from_event: "（其他）",
          to_event: "（其他）",
          count: rest.reduce((sum, edge) => sum + edge.count, 0),
        })
      }
    }

    return { edges, truncated }
  }

  private resolveProjectKey(projectKey: string): Promise<string> {
    return this.projectResolver.resolveCanonicalKeyOrThrow(projectKey)
  }
}
