import { buildListQuery, requestJson } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"
import type { Platform } from "@/lib/platform"

/**
 * 事件分析的管理端接口。
 *
 * 分工与后端一致：`stats/*` 走小时汇总，`analysis/*` 走明细。凡是需要按标识去重
 * 或者串联时间序列的问题都在后者——汇总表按设计不含 distinctId。
 */

function getTokenOrThrow(): string {
  const token = getSessionToken()
  if (!token) {
    throw new Error("未登录或会话已过期")
  }
  return token
}

/** 统计查询的公共区间参数。省略时后端默认最近 7 天。 */
export type EventRange = {
  start_time?: number
  end_time?: number
  /** 相对 UTC 的分钟偏移，即 `-new Date().getTimezoneOffset()`。 */
  tz_offset_minutes?: number
}

export type Granularity = "hour" | "day"

/** 事件定义。由采集端自动发现，没有对应的创建接口。 */
export type EventDefinitionItem = {
  event_definition_id: string
  project_key: string
  /** 客户端上报时使用的键，归一化后的小写形式。不可修改。 */
  name: string
  /** 给管理端看的名字；为空时界面回退到 name。 */
  display_name: string | null
  description: string | null
  archived: boolean
  first_seen_time: number
  last_seen_time: number
  /** 查询区间内的上报量。 */
  range_count: number
}

export type ListEventDefinitionsResponse = {
  total: number
  data: EventDefinitionItem[]
}

export type EventOverview = {
  start_time: number
  end_time: number
  /** 事件总量，来自小时汇总。 */
  total: number
  /** 独立标识数，来自明细——汇总表按设计不含这一维。 */
  unique_users: number
  unique_sessions: number
  event_types: number
}

export type EventTimeseriesPoint = { bucket: number; count: number }

/** 一条命名序列。各序列的时间桶逐一对齐（含 0 值桶），可直接堆叠。 */
export type EventSeries = { key: string; data: EventTimeseriesPoint[] }

export type EventTimeseriesGroupBy = "event" | "platform" | "region"

export type EventTimeseries = {
  start_time: number
  end_time: number
  granularity: Granularity
  tz_offset_minutes: number
  event_name: string | null
  group_by: EventTimeseriesGroupBy | null
  /** 总量序列，空桶补零；granularity=day 时桶是当地零点对应的时刻。 */
  data: EventTimeseriesPoint[]
  /** 仅在请求时指定 group_by 才非空。 */
  series: EventSeries[] | null
}

export type EventBreakdownDimension = "event" | "platform" | "region" | "property"

export type EventCountBucket = { key: string; label: string; count: number }

export type EventBreakdown = {
  start_time: number
  end_time: number
  dimension: EventBreakdownDimension
  property_key: string | null
  /** 全量总数而非本页之和，据此算出的占比在 limit 截尾后仍然真实。 */
  total: number
  data: EventCountBucket[]
}

export type EventHeatmapCell = { weekday: number; hour: number; count: number }

export type EventHeatmap = {
  start_time: number
  end_time: number
  tz_offset_minutes: number
  /** 固定 168 格，含无数据的空格。 */
  data: EventHeatmapCell[]
}

/** 属性筛选条件。`op` 是闭集，值一律以参数进入后端查询。 */
export const EVENT_FILTER_OPS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
  "not_exists",
] as const

export type EventFilterOp = (typeof EVENT_FILTER_OPS)[number]

/** 各算子的中文名与是否需要填值，筛选行的表单据此渲染。 */
export const EVENT_FILTER_OP_META: Record<EventFilterOp, { label: string; needsValue: boolean }> = {
  eq: { label: "等于", needsValue: true },
  neq: { label: "不等于", needsValue: true },
  in: { label: "属于", needsValue: true },
  not_in: { label: "不属于", needsValue: true },
  contains: { label: "包含", needsValue: true },
  gt: { label: "大于", needsValue: true },
  gte: { label: "大于等于", needsValue: true },
  lt: { label: "小于", needsValue: true },
  lte: { label: "小于等于", needsValue: true },
  exists: { label: "存在", needsValue: false },
  not_exists: { label: "不存在", needsValue: false },
}

export type EventFilter = {
  property: string
  op: EventFilterOp
  value?: string | number | boolean | Array<string | number | boolean>
}

export type FunnelStep = {
  event_name: string
  filters?: EventFilter[]
}

export type FunnelStepResult = {
  step: number
  event_name: string
  users: number
  /** 相对上一步的转化率，0 到 1；第一步恒为 1。 */
  conversion_rate: number
  total_conversion_rate: number
  dropped: number
}

export type FunnelResponse = {
  start_time: number
  end_time: number
  window_seconds: number
  data: FunnelStepResult[]
}

export type RetentionCell = { period: number; users: number; rate: number }

export type RetentionCohort = {
  cohort: number
  size: number
  /** 尚未走完的周期为 null，不是 0——把还没发生的时间显示成 0% 留存是不诚实的。 */
  cells: Array<RetentionCell | null>
}

export type RetentionResponse = {
  start_time: number
  end_time: number
  period: "day" | "week"
  periods: number
  cohorts: RetentionCohort[]
}

export type PathEdge = {
  step: number
  from_event: string
  to_event: string
  count: number
}

export type PathsResponse = {
  start_time: number
  end_time: number
  scope: "session" | "user"
  depth: number
  /** 有分支被并入「（其他）」时为 true。 */
  truncated: boolean
  data: PathEdge[]
}

export type EventMeasure = "count" | "unique_users" | "count_per_user"

export const EVENT_MEASURE_LABELS: Record<EventMeasure, string> = {
  count: "事件数",
  unique_users: "独立用户数",
  count_per_user: "人均次数",
}

export type DslEvent = {
  name: string
  /** 单个大写字母，公式里靠它引用。 */
  alias: string
  measure?: EventMeasure
  filters?: EventFilter[]
}

export type DslGroupBy = {
  kind: "property" | "platform" | "region" | "event"
  /** kind 为 property 时必填。 */
  key?: string
}

/** 指标 DSL：查询构建器产出的结构，也是看板卡片保存下来的内容。 */
export type EventQuery = EventRange & {
  type: "timeseries" | "breakdown" | "value"
  events: DslEvent[]
  /** 作用于全部事件的公共条件，与各事件自己的 filters 取交集。 */
  filters?: EventFilter[]
  /** 跨事件运算，例如 "A / B * 100"。只认别名、数字与 + - * / ( )。 */
  formula?: string
  group_by?: DslGroupBy
  granularity?: Granularity
  limit?: number
}

/** 形状随 query.type 变化。 */
export type EventQueryResponse = {
  start_time: number
  end_time: number
  type: EventQuery["type"]
  series?: EventSeries[]
  total?: number
  buckets?: EventCountBucket[]
  values?: Record<string, number>
  result?: number
}

export type DashboardCardItem = {
  card_id: string
  project_key: string
  title: string
  description: string | null
  query: EventQuery
  layout: Record<string, unknown> | null
  sort_order: number
  created_time: number
  updated_time: number
}

export type ListDashboardCardsResponse = {
  total: number
  data: DashboardCardItem[]
}

// ---- 事件定义 ----

export async function listEventDefinitions(
  projectKey: string,
  params: EventRange & {
    limit?: number
    offset?: number
    search?: string
    include_archived?: boolean
  } = {},
  signal?: AbortSignal,
): Promise<ListEventDefinitionsResponse> {
  const query = buildListQuery({ ...params })
  return requestJson<ListEventDefinitionsResponse>(
    `/admin/projects/${projectKey}/events/definitions?${query}`,
    { token: getTokenOrThrow(), signal },
  )
}

export async function updateEventDefinition(
  projectKey: string,
  definitionId: string,
  input: { display_name?: string; description?: string; archived?: boolean },
): Promise<EventDefinitionItem> {
  return requestJson<EventDefinitionItem>(
    `/admin/projects/${projectKey}/events/definitions/${definitionId}`,
    { method: "PATCH", token: getTokenOrThrow(), body: input },
  )
}

export async function deleteEventDefinition(
  projectKey: string,
  definitionId: string,
): Promise<{ success: true }> {
  return requestJson<{ success: true }>(
    `/admin/projects/${projectKey}/events/definitions/${definitionId}`,
    { method: "DELETE", token: getTokenOrThrow() },
  )
}

// ---- 统计 ----

export async function getEventOverview(
  projectKey: string,
  params: EventRange = {},
  signal?: AbortSignal,
): Promise<EventOverview> {
  const query = buildListQuery({ ...params })
  return requestJson<EventOverview>(
    `/admin/projects/${projectKey}/events/stats/overview?${query}`,
    { token: getTokenOrThrow(), signal },
  )
}

export async function getEventTimeseries(
  projectKey: string,
  params: EventRange & {
    granularity?: Granularity
    event_name?: string
    group_by?: EventTimeseriesGroupBy
    limit?: number
  } = {},
  signal?: AbortSignal,
): Promise<EventTimeseries> {
  const query = buildListQuery({ ...params })
  return requestJson<EventTimeseries>(
    `/admin/projects/${projectKey}/events/stats/timeseries?${query}`,
    { token: getTokenOrThrow(), signal },
  )
}

export async function getEventBreakdown(
  projectKey: string,
  params: EventRange & {
    dimension?: EventBreakdownDimension
    property_key?: string
    event_name?: string
    limit?: number
  } = {},
  signal?: AbortSignal,
): Promise<EventBreakdown> {
  const query = buildListQuery({ ...params })
  return requestJson<EventBreakdown>(
    `/admin/projects/${projectKey}/events/stats/breakdown?${query}`,
    { token: getTokenOrThrow(), signal },
  )
}

export async function getEventHeatmap(
  projectKey: string,
  params: EventRange & { event_name?: string } = {},
  signal?: AbortSignal,
): Promise<EventHeatmap> {
  const query = buildListQuery({ ...params })
  return requestJson<EventHeatmap>(`/admin/projects/${projectKey}/events/stats/heatmap?${query}`, {
    token: getTokenOrThrow(),
    signal,
  })
}

// ---- 组合分析 ----
//
// 这四个用 POST 只是因为入参是结构化数组，塞进 query string 既超长又要自己发明
// 一套编码。它们仍然只需要 events:read 权限。

export async function getFunnel(
  projectKey: string,
  body: EventRange & { steps: FunnelStep[]; window_seconds?: number },
  signal?: AbortSignal,
): Promise<FunnelResponse> {
  return requestJson<FunnelResponse>(`/admin/projects/${projectKey}/events/analysis/funnel`, {
    method: "POST",
    token: getTokenOrThrow(),
    body,
    signal,
  })
}

export async function getRetention(
  projectKey: string,
  body: EventRange & {
    start_event: string
    return_event?: string
    period?: "day" | "week"
    periods?: number
  },
  signal?: AbortSignal,
): Promise<RetentionResponse> {
  return requestJson<RetentionResponse>(`/admin/projects/${projectKey}/events/analysis/retention`, {
    method: "POST",
    token: getTokenOrThrow(),
    body,
    signal,
  })
}

export async function getPaths(
  projectKey: string,
  body: EventRange & {
    start_event?: string
    depth?: number
    branch_limit?: number
    scope?: "session" | "user"
  } = {},
  signal?: AbortSignal,
): Promise<PathsResponse> {
  return requestJson<PathsResponse>(`/admin/projects/${projectKey}/events/analysis/paths`, {
    method: "POST",
    token: getTokenOrThrow(),
    body,
    signal,
  })
}

export async function runEventQuery(
  projectKey: string,
  query: EventQuery,
  signal?: AbortSignal,
): Promise<EventQueryResponse> {
  return requestJson<EventQueryResponse>(`/admin/projects/${projectKey}/events/analysis/query`, {
    method: "POST",
    token: getTokenOrThrow(),
    body: query,
    signal,
  })
}

// ---- 看板 ----

export async function listDashboardCards(
  projectKey: string,
  signal?: AbortSignal,
): Promise<ListDashboardCardsResponse> {
  return requestJson<ListDashboardCardsResponse>(
    `/admin/projects/${projectKey}/events/dashboards/cards`,
    { token: getTokenOrThrow(), signal },
  )
}

export async function createDashboardCard(
  projectKey: string,
  input: {
    title: string
    query: EventQuery
    description?: string
    layout?: Record<string, unknown>
    sort_order?: number
  },
): Promise<DashboardCardItem> {
  return requestJson<DashboardCardItem>(`/admin/projects/${projectKey}/events/dashboards/cards`, {
    method: "POST",
    token: getTokenOrThrow(),
    body: input,
  })
}

export async function updateDashboardCard(
  projectKey: string,
  cardId: string,
  input: {
    title?: string
    query?: EventQuery
    description?: string
    layout?: Record<string, unknown>
    sort_order?: number
  },
): Promise<DashboardCardItem> {
  return requestJson<DashboardCardItem>(
    `/admin/projects/${projectKey}/events/dashboards/cards/${cardId}`,
    { method: "PATCH", token: getTokenOrThrow(), body: input },
  )
}

export async function deleteDashboardCard(
  projectKey: string,
  cardId: string,
): Promise<{ success: true }> {
  return requestJson<{ success: true }>(
    `/admin/projects/${projectKey}/events/dashboards/cards/${cardId}`,
    { method: "DELETE", token: getTokenOrThrow() },
  )
}

/**
 * 代最终用户删除其全部事件明细（GDPR Art.17）。
 *
 * 小时汇总不在删除范围内：它只保存计数，不含任何标识符。
 */
export async function deleteEventSubject(
  projectKey: string,
  distinctId: string,
): Promise<{ success: true; deleted: number }> {
  return requestJson<{ success: true; deleted: number }>(
    `/admin/projects/${projectKey}/events/subjects/${encodeURIComponent(distinctId)}`,
    { method: "DELETE", token: getTokenOrThrow() },
  )
}

export type { Platform }
