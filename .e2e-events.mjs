/**
 * 事件采集与分析的端到端验证。
 *
 * 在容器里跑，直接打本机的 API。重点验三段从没在真库上跑过的原始 SQL：
 * 漏斗、留存、路径。顺带验采集侧的幂等、时钟钳制、退出信号与数据主体权利。
 *
 *   node /tmp/e2e-events.mjs <projectKey> <apiKey>
 */

const BASE = "http://127.0.0.1:4000/api/v1"
const [projectKey, apiKey] = process.argv.slice(2)

const DAY = 86400
const now = Math.floor(Date.now() / 1000)
/** 基准日的零点，保证事件落在确定的日桶里。 */
const day0 = Math.floor((now - 6 * DAY) / DAY) * DAY + 3600

let passed = 0
let failed = 0

function check(name, ok, detail) {
  if (ok) {
    passed += 1
    console.log(`  ✔ ${name}`)
  } else {
    failed += 1
    console.log(`  ✘ ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
  }
}

function uuid() {
  return crypto.randomUUID()
}

async function api(method, path, { body, auth = false, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: `Bearer ${apiKey}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: response.status, body: json }
}

function ev(name, occurredAt, properties) {
  return {
    event_id: uuid(),
    name,
    occurred_at: occurredAt,
    ...(properties ? { properties } : {}),
  }
}

async function ingest(distinctId, sessionId, events, headers) {
  return api("POST", `/public/${projectKey}/events`, {
    body: { distinct_id: distinctId, session_id: sessionId, events },
    headers,
  })
}

// ---------------------------------------------------------------- 准备

const created = await api("POST", "/admin/projects", {
  auth: true,
  body: { project_key: projectKey, name: "E2E 事件验证（临时）" },
})
if (created.status !== 201) {
  console.error("建临时项目失败：", created)
  process.exit(1)
}
check(
  "新建项目回显事件采集的两个新字段",
  created.body.event_collection_enabled === true && created.body.event_retention_days === 90,
  {
    event_collection_enabled: created.body.event_collection_enabled,
    event_retention_days: created.body.event_retention_days,
  },
)

// ---------------------------------------------------------------- 灌数据

console.log("\n[1] 采集")

/**
 * 五个用户走一条三步漏斗，逐级流失：
 *   u1..u5 → app_opened；u1..u4 → cart_viewed；u1..u2 → checkout_clicked
 * 每人从 day0 起连续几天回访，用来验留存。
 */
const users = ["u1", "u2", "u3", "u4", "u5"].map((suffix) => `e2e-${suffix}-${Date.now()}`)

const funnelPlan = [
  { user: users[0], steps: 3, returnDays: [0, 1, 2, 3] },
  { user: users[1], steps: 3, returnDays: [0, 1] },
  { user: users[2], steps: 2, returnDays: [0, 2] },
  { user: users[3], steps: 2, returnDays: [0] },
  { user: users[4], steps: 1, returnDays: [0] },
]

const STEPS = ["app_opened", "cart_viewed", "checkout_clicked"]

for (const plan of funnelPlan) {
  const session = uuid()
  // 漏斗序列：同一会话内依次发生，每步隔 60 秒。
  const events = []
  for (let i = 0; i < plan.steps; i += 1) {
    events.push(ev(STEPS[i], day0 + i * 60, i === 2 ? { plan: "pro" } : { plan: "free" }))
  }
  const result = await ingest(plan.user, session, events)
  if (result.status !== 202 || result.body.accepted !== plan.steps) {
    check(`灌入 ${plan.user} 的漏斗序列`, false, result)
  }

  // 回访：day0 之后的第 N 天各来一次 app_opened。
  for (const offset of plan.returnDays.slice(1)) {
    await ingest(plan.user, uuid(), [ev("app_opened", day0 + offset * DAY + 120)])
  }
}
check("五个用户的漏斗与回访序列已灌入", true)

// ---------------------------------------------------------------- 采集侧断言

const idempotentId = uuid()
const first = await ingest(users[0], uuid(), [
  { event_id: idempotentId, name: "idempotency_probe", occurred_at: day0 },
])
const second = await ingest(users[0], uuid(), [
  { event_id: idempotentId, name: "idempotency_probe", occurred_at: day0 },
])
check("重复的 event_id 第二次不入库", first.body.accepted === 1 && second.body.accepted === 0, {
  first: first.body,
  second: second.body,
})

const dnt = await ingest(users[0], uuid(), [ev("dnt_probe", day0)], {
  "x-verhub-do-not-track": "1",
})
check(
  "带 do-not-track 头时返回 202 但不入库",
  dnt.status === 202 && dnt.body.suppressed === true && dnt.body.accepted === 0,
  dnt,
)

const badName = await ingest(users[0], uuid(), [
  { event_id: uuid(), name: "非法 事件名", occurred_at: day0 },
  ev("valid_after_invalid", day0),
])
check(
  "非法事件名被跳过，同批其余事件照常入库",
  badName.body.accepted === 1 && badName.body.skipped === 1,
  badName.body,
)

const skewed = await ingest(users[0], uuid(), [
  { event_id: uuid(), name: "clock_skew_probe", occurred_at: 4_000_000_000 },
])
check("时钟错乱的事件被接受（钳制到接收时间）", skewed.body.accepted === 1, skewed.body)

// ---------------------------------------------------------------- 定义与统计

console.log("\n[2] 事件定义与统计")

const range = `start_time=${day0 - DAY}&end_time=${now}&tz_offset_minutes=0`

const defs = await api(
  "GET",
  `/admin/projects/${projectKey}/events/definitions?${range}&limit=100`,
  {
    auth: true,
  },
)
const names = (defs.body.data ?? []).map((d) => d.name)
check(
  "事件定义由采集端自动登记（无需预先建立）",
  STEPS.every((s) => names.includes(s)),
  names,
)
check("非法事件名没有产生定义", !names.includes("非法 事件名"), names)
check(
  "clock_skew_probe 的 occurredAt 被钳制到当前时间附近",
  (defs.body.data.find((d) => d.name === "clock_skew_probe")?.last_seen_time ?? 0) <= now + 300,
)

const overview = await api("GET", `/admin/projects/${projectKey}/events/stats/overview?${range}`, {
  auth: true,
})
check("概览：独立标识数为 5", overview.body.unique_users === 5, {
  unique_users: overview.body.unique_users,
  total: overview.body.total,
})
check("概览：事件总量大于 0", overview.body.total > 0, overview.body)

const ts = await api(
  "GET",
  `/admin/projects/${projectKey}/events/stats/timeseries?${range}&granularity=day&group_by=event`,
  { auth: true },
)
check("趋势：总量序列补齐了空桶", Array.isArray(ts.body.data) && ts.body.data.length >= 7, {
  buckets: ts.body.data?.length,
})
check("趋势：按事件拆出了多条序列", (ts.body.series ?? []).length >= 3, {
  series: (ts.body.series ?? []).map((s) => s.key),
})

const byProp = await api(
  "GET",
  `/admin/projects/${projectKey}/events/stats/breakdown?${range}&dimension=property&property_key=plan`,
  { auth: true },
)
const planKeys = (byProp.body.data ?? []).map((b) => b.key)
check("属性分布：能按 properties 的键分组", planKeys.includes("free") && planKeys.includes("pro"), {
  planKeys,
})

const heatmap = await api("GET", `/admin/projects/${projectKey}/events/stats/heatmap?${range}`, {
  auth: true,
})
check("热力图固定 168 格", heatmap.body.data?.length === 168, { cells: heatmap.body.data?.length })

// ---------------------------------------------------------------- 三段原始 SQL

console.log("\n[3] 组合分析（三段原始 SQL）")

const funnel = await api("POST", `/admin/projects/${projectKey}/events/analysis/funnel`, {
  auth: true,
  body: {
    start_time: day0 - DAY,
    end_time: now,
    steps: STEPS.map((event_name) => ({ event_name })),
    window_seconds: 7 * DAY,
  },
})
const funnelUsers = (funnel.body.data ?? []).map((s) => s.users)
check("漏斗：逐级收窄 5 → 4 → 2", JSON.stringify(funnelUsers) === "[5,4,2]", {
  funnelUsers,
  body: funnel.body,
})
const step2 = funnel.body.data?.[1]
check(
  "漏斗：转化率与流失数自洽",
  step2?.dropped === 1 && Math.abs(step2.conversion_rate - 0.8) < 1e-9,
  step2,
)

const funnelFiltered = await api("POST", `/admin/projects/${projectKey}/events/analysis/funnel`, {
  auth: true,
  body: {
    start_time: day0 - DAY,
    end_time: now,
    steps: [
      { event_name: "app_opened" },
      { event_name: "checkout_clicked", filters: [{ property: "plan", op: "eq", value: "pro" }] },
    ],
  },
})
check(
  "漏斗：步骤上的属性条件生效（plan=pro 只剩 2 人）",
  funnelFiltered.body.data?.[1]?.users === 2,
  funnelFiltered.body.data,
)

const funnelNarrow = await api("POST", `/admin/projects/${projectKey}/events/analysis/funnel`, {
  auth: true,
  body: {
    start_time: day0 - DAY,
    end_time: now,
    steps: STEPS.map((event_name) => ({ event_name })),
    // 三步之间各隔 60 秒，窗口收到 60 秒后第三步应当落在窗外。
    window_seconds: 60,
  },
})
check(
  "漏斗：转化窗口锚定在第一步（收窄到 60 秒后第三步归零）",
  funnelNarrow.body.data?.[2]?.users === 0,
  funnelNarrow.body.data?.map((s) => s.users),
)

const retention = await api("POST", `/admin/projects/${projectKey}/events/analysis/retention`, {
  auth: true,
  body: {
    start_time: day0 - DAY,
    end_time: now,
    start_event: "app_opened",
    return_event: "app_opened",
    period: "day",
    periods: 5,
    tz_offset_minutes: 0,
  },
})
const cohort = (retention.body.cohorts ?? []).find((c) => c.size > 0)
check("留存：形成了一个非空队列", cohort !== undefined && cohort.size === 5, {
  cohorts: retention.body.cohorts?.map((c) => ({ cohort: c.cohort, size: c.size })),
})
check("留存：第 0 天留存为 100%", cohort?.cells?.[0]?.rate === 1, cohort?.cells?.[0])
check(
  "留存：第 1 天回访 2 人（u1、u2）",
  cohort?.cells?.[1]?.users === 2,
  cohort?.cells?.slice(0, 4),
)
check(
  "留存：第 2 天回访 2 人（u1、u3）",
  cohort?.cells?.[2]?.users === 2,
  cohort?.cells?.slice(0, 4),
)

const futureRetention = await api(
  "POST",
  `/admin/projects/${projectKey}/events/analysis/retention`,
  {
    auth: true,
    body: {
      start_time: now - 2 * DAY,
      end_time: now,
      start_event: "app_opened",
      period: "day",
      periods: 10,
    },
  },
)
const anyCohort = futureRetention.body.cohorts?.[0]
check(
  "留存：尚未走完的周期返回 null 而不是 0",
  Array.isArray(anyCohort?.cells) && anyCohort.cells.some((c) => c === null),
  anyCohort?.cells,
)

const paths = await api("POST", `/admin/projects/${projectKey}/events/analysis/paths`, {
  auth: true,
  body: {
    start_time: day0 - DAY,
    end_time: now,
    start_event: "app_opened",
    depth: 4,
    branch_limit: 5,
    scope: "session",
  },
})
const edge1 = (paths.body.data ?? []).find(
  (e) => e.step === 1 && e.from_event === "app_opened" && e.to_event === "cart_viewed",
)
check("路径：第 1 步 app_opened → cart_viewed 有 4 次", edge1?.count === 4, {
  edges: paths.body.data,
})
const edge2 = (paths.body.data ?? []).find(
  (e) => e.step === 2 && e.from_event === "cart_viewed" && e.to_event === "checkout_clicked",
)
check("路径：第 2 步 cart_viewed → checkout_clicked 有 2 次", edge2?.count === 2, {
  edges: paths.body.data,
})

// ---------------------------------------------------------------- 指标 DSL

console.log("\n[4] 指标 DSL")

const dslValue = await api("POST", `/admin/projects/${projectKey}/events/analysis/query`, {
  auth: true,
  body: {
    start_time: day0 - DAY,
    end_time: now,
    type: "value",
    events: [
      { name: "checkout_clicked", alias: "A", measure: "unique_users" },
      { name: "cart_viewed", alias: "B", measure: "unique_users" },
    ],
    formula: "A / B * 100",
  },
})
check(
  "DSL：公式 A / B * 100 得到 50（2/4）",
  Math.abs(dslValue.body.result - 50) < 1e-9,
  dslValue.body,
)

const dslBad = await api("POST", `/admin/projects/${projectKey}/events/analysis/query`, {
  auth: true,
  body: {
    start_time: day0 - DAY,
    end_time: now,
    type: "value",
    events: [{ name: "app_opened", alias: "A" }],
    formula: "process.exit(1)",
  },
})
check("DSL：非法公式被拒为 400 而不是执行", dslBad.status === 400, dslBad)

const injection = await api("POST", `/admin/projects/${projectKey}/events/analysis/query`, {
  auth: true,
  body: {
    start_time: day0 - DAY,
    end_time: now,
    type: "value",
    events: [
      {
        name: "app_opened",
        alias: "A",
        filters: [{ property: '\'; DROP TABLE "EventRecord"; --', op: "eq", value: "x" }],
      },
    ],
  },
})
check(
  "DSL：注入尝试被参数化，查询正常返回 0",
  injection.status === 200 && injection.body.result === 0,
  injection,
)

// ---------------------------------------------------------------- 数据主体权利

console.log("\n[5] 数据主体权利")

const subject = users[0]
const statsBefore = await api(
  "GET",
  `/admin/projects/${projectKey}/events/stats/overview?${range}`,
  {
    auth: true,
  },
)

const exported = await api(
  "GET",
  `/public/${projectKey}/events/me?distinct_id=${encodeURIComponent(subject)}`,
)
check("导出：拿到该标识下的事件明细", exported.status === 200 && exported.body.total > 0, {
  status: exported.status,
  total: exported.body?.total,
})
check(
  "导出：IP 已匿名化（末段清零）",
  exported.body.data?.every((r) => r.ip === null || /\.0$/.test(r.ip) || r.ip.endsWith(":0")),
  exported.body.data?.[0]?.ip,
)

const deleted = await api(
  "DELETE",
  `/public/${projectKey}/events/me?distinct_id=${encodeURIComponent(subject)}`,
)
check("删除：返回删除条数", deleted.status === 200 && deleted.body.deleted > 0, deleted.body)

const exportedAfter = await api(
  "GET",
  `/public/${projectKey}/events/me?distinct_id=${encodeURIComponent(subject)}`,
)
check("删除后：明细归零", exportedAfter.body.total === 0, exportedAfter.body)

const statsAfter = await api(
  "GET",
  `/admin/projects/${projectKey}/events/stats/overview?${range}`,
  {
    auth: true,
  },
)
check(
  "删除后：小时汇总的计数不变（它是匿名信息，不在删除范围内）",
  statsAfter.body.total === statsBefore.body.total,
  { before: statsBefore.body.total, after: statsAfter.body.total },
)
check(
  "删除后：独立标识数减 1",
  statsAfter.body.unique_users === statsBefore.body.unique_users - 1,
  { before: statsBefore.body.unique_users, after: statsAfter.body.unique_users },
)

// ---------------------------------------------------------------- 收尾

const dropped = await api("DELETE", `/admin/projects/${projectKey}`, { auth: true })
check("收尾：临时项目已删除", dropped.status === 200, dropped.status)

const orphan = await api("GET", `/admin/projects/${projectKey}/events/stats/overview?${range}`, {
  auth: true,
})
check("收尾：项目删除后事件随外键级联清除", orphan.status === 404, orphan.status)

// ---------------------------------------------------------------- 结论

console.log(`\n通过 ${passed}，失败 ${failed}`)
process.exit(failed === 0 ? 0 : 1)
