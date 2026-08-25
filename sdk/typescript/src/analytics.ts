import type { Platform } from "./models"

/**
 * 事件采集的本地状态：匿名标识、退出标记与待发送队列。
 *
 * 这是整个 SDK 里唯一会在设备上写入数据的部分；改动这里要同步更新
 * 《SDK 合规性文档》。
 */

/** 本地存储抽象。浏览器走 localStorage，服务端运行时走文件，关闭持久化时走内存。 */
export type AnalyticsStorage = {
  /** 读一个键；不存在时返回 null。 */
  read(key: string): string | null
  /** 写一个键，覆盖同名旧值。 */
  write(key: string, value: string): void
  /** 删一个键；不存在时静默返回。 */
  remove(key: string): void
}

/** 匿名标识的持久化程度。 */
export type AnalyticsPersistence =
  /** 写入本地，重启后仍是同一个标识，可算跨天留存。 */
  | "device"
  /** 只在进程内存里，重启即换新，无法算跨天留存。 */
  | "session"
  /** 不生成持久标识，也不落盘。事件仍可上报，但无法做按人的分析。 */
  | "none"

export type AnalyticsOptions = {
  /** 关掉后 track() 直接返回，不生成标识、不落盘、不发请求。默认 true。 */
  enabled?: boolean
  /**
   * 开启后，在 grantConsent() 被调用前不采集、不写盘（含匿名标识的生成），
   * 事件直接丢弃。面向欧盟用户的接入方应当开启。
   */
  requireConsent?: boolean
  /** 默认 "device"。 */
  persistence?: AnalyticsPersistence
  /** 浏览器环境下是否尊重 GPC 与 DNT 信号，默认 true。 */
  respectDoNotTrack?: boolean
  /** 攒批的时间上限（毫秒），默认 5000。 */
  flushIntervalMs?: number
  /** 攒够这么多条立即发送，默认 20，上限 50。 */
  batchSize?: number
  /** 队列上限，超出丢最旧的，默认 500。 */
  maxQueueSize?: number
  /** 会话空闲多久换新（毫秒），默认 30 分钟。 */
  sessionTimeoutMs?: number
  /**
   * 覆盖本地状态的命名空间。默认由 `baseUrl` 的 origin 与 `projectKey` 算出。
   *
   * 同一实例同一项目下的两个应用要各自独立的匿名标识时显式指定。
   */
  namespace?: string
  /** 自定义存储实现，可用于注入测试桩或接管持久化位置。 */
  storage?: AnalyticsStorage
}

/** 队列里的一条事件。 */
export type QueuedEvent = {
  event_id: string
  name: string
  occurred_at: number
  properties?: Record<string, unknown>
}

export const DEFAULT_FLUSH_INTERVAL_MS = 5000
export const DEFAULT_BATCH_SIZE = 20
export const DEFAULT_MAX_QUEUE_SIZE = 500
export const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000

/** 服务端单批上限，与 VERHUB_EVENT_BATCH_MAX 的默认值一致。 */
const SERVER_BATCH_MAX = 50

/** 重试退避的上限。 */
const MAX_BACKOFF_MS = 60_000

/**
 * 取 baseUrl 的 origin（协议 + 主机 + 端口），路径一律忽略。
 *
 * 主机名与协议转小写，剥掉 userinfo，`http` 的 80 与 `https` 的 443 会被省略。
 * 不含 `://` 的输入原样转小写返回。四个语言的 SDK 规则相同。
 *
 * @param baseUrl 已规范化（去首尾空白、去末尾斜杠）的根地址
 */
export function originOf(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  const schemeEnd = trimmed.indexOf("://")
  if (schemeEnd < 0) {
    return trimmed.toLowerCase()
  }

  const scheme = trimmed.slice(0, schemeEnd).toLowerCase()
  const rest = trimmed.slice(schemeEnd + 3)
  const slash = rest.indexOf("/")
  let authority = (slash < 0 ? rest : rest.slice(0, slash)).toLowerCase()

  const at = authority.lastIndexOf("@")
  if (at >= 0) {
    authority = authority.slice(at + 1)
  }

  // IPv6 的冒号在方括号里，端口只可能在 `]` 之后。
  const hostEnd = authority.lastIndexOf("]")
  const colon = authority.indexOf(":", hostEnd < 0 ? 0 : hostEnd)
  if (colon >= 0) {
    const port = authority.slice(colon + 1)
    if ((scheme === "http" && port === "80") || (scheme === "https" && port === "443")) {
      authority = authority.slice(0, colon)
    }
  }

  return `${scheme}://${authority}`
}

/**
 * FNV-1a 32 位，按 UTF-8 字节计算，输出 8 位小写 hex。
 *
 * 四个语言的 SDK 对同一输入给出同一结果。
 */
export function fnv1a32Hex(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let hash = 0x811c9dc5
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i] as number
    // 乘 16777619，用移位避免 32 位溢出后的精度丢失。
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

/**
 * 本地状态的命名空间：`<origin 哈希>-<小写 projectKey>`。
 *
 * `projectKey` 去首尾空白后转小写；为空或只有空白时用 `default`。
 * 四个语言的 SDK 对同一组入参给出同一结果。
 */
export function analyticsNamespace(baseUrl: string, projectKey: string | undefined): string {
  const key = (projectKey ?? "default").trim().toLowerCase() || "default"
  return `${fnv1a32Hex(originOf(baseUrl))}-${key}`
}

/** 把命名空间洗成安全的文件名：非 `[A-Za-z0-9._-]` 换成下划线，截到 96 字符。 */
function fileSafe(namespace: string): string {
  return namespace.replace(/[^a-z0-9._-]/gi, "_").slice(0, 96)
}

/** 进程内存储，`persistence: "session"` 用。 */
export function memoryStorage(): AnalyticsStorage {
  const map = new Map<string, string>()
  return {
    read: (key) => map.get(key) ?? null,
    write: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  }
}

/** 什么都不存的实现，`persistence: "none"` 用。 */
export function nullStorage(): AnalyticsStorage {
  return { read: () => null, write: () => {}, remove: () => {} }
}

/**
 * 按运行环境挑一个持久化实现：浏览器用 localStorage，Node / Bun 用用户状态
 * 目录下的 JSON 文件，都拿不到时退回内存。
 */
export function defaultStorage(namespace: string): AnalyticsStorage {
  const ls = (globalThis as { localStorage?: Storage }).localStorage
  if (ls) {
    return {
      read: (key) => {
        try {
          return ls.getItem(key)
        } catch {
          return null
        }
      },
      write: (key, value) => {
        try {
          ls.setItem(key, value)
        } catch {
          /* 写不进去就不持久化 */
        }
      },
      remove: (key) => {
        try {
          ls.removeItem(key)
        } catch {
          /* 同上 */
        }
      },
    }
  }

  const fileStore = nodeFileStorage(namespace)
  return fileStore ?? memoryStorage()
}

/** Node / Bun 下把状态写到用户数据目录里，每个命名空间一个 JSON 文件。 */
function nodeFileStorage(namespace: string): AnalyticsStorage | null {
  const proc = (
    globalThis as {
      process?: {
        getBuiltinModule?: (id: string) => unknown
        env?: Record<string, string | undefined>
        platform?: string
        pid?: number
      }
    }
  ).process
  const load = (id: string): unknown => {
    try {
      return proc?.getBuiltinModule?.(id)
    } catch {
      return undefined
    }
  }

  const fs = load("node:fs") as
    | {
        readFileSync?: (p: string, e: string) => string
        writeFileSync?: (p: string, d: string) => void
        mkdirSync?: (p: string, o: unknown) => void
        renameSync?: (a: string, b: string) => void
        unlinkSync?: (p: string) => void
      }
    | undefined
  const path = load("node:path") as { join?: (...parts: string[]) => string } | undefined
  const os = load("node:os") as { homedir?: () => string } | undefined

  if (!fs?.readFileSync || !fs.writeFileSync || !path?.join || !os?.homedir) {
    return null
  }

  const base =
    proc?.env?.XDG_STATE_HOME ??
    (proc?.platform === "win32"
      ? (proc.env?.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"))
      : proc?.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support")
        : path.join(os.homedir(), ".local", "state"))
  const dir = path.join(base, "verhub-sdk")
  const file = path.join(dir, `${fileSafe(namespace)}.json`)

  const readAll = (): Record<string, string> => {
    try {
      return JSON.parse(fs.readFileSync!(file, "utf8")) as Record<string, string>
    } catch {
      return {}
    }
  }
  const writeAll = (data: Record<string, string>): void => {
    // 先写临时文件再 rename，写入过程中崩溃不会留下半个 JSON。
    const tmp = `${file}.${proc?.pid ?? 0}.tmp`
    try {
      fs.mkdirSync?.(dir, { recursive: true })
      fs.writeFileSync!(tmp, JSON.stringify(data))
      fs.renameSync?.(tmp, file)
    } catch {
      try {
        fs.unlinkSync?.(tmp)
      } catch {
        /* 临时文件清不掉，下次同名覆盖 */
      }
    }
  }

  return {
    read: (key) => readAll()[key] ?? null,
    write: (key, value) => {
      const data = readAll()
      data[key] = value
      writeAll(data)
    },
    remove: (key) => {
      const data = readAll()
      delete data[key]
      writeAll(data)
    },
  }
}

/** 随机 UUIDv4。不读取任何设备特征。 */
export function randomId(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto
  if (typeof cryptoObj?.randomUUID === "function") {
    return cryptoObj.randomUUID()
  }
  if (typeof cryptoObj?.getRandomValues === "function") {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6]! & 0x0f) | 0x40
    bytes[8] = (bytes[8]! & 0x3f) | 0x80
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`
}

/** 浏览器的退出信号：GPC 或 DNT 打开时为 true。非浏览器环境恒为 false。 */
export function detectDoNotTrack(): boolean {
  const nav = (
    globalThis as { navigator?: { globalPrivacyControl?: boolean; doNotTrack?: string } }
  ).navigator
  if (!nav) {
    return false
  }
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1"
}

type SendBatch = (payload: {
  distinct_id: string
  session_id?: string
  events: QueuedEvent[]
}) => Promise<unknown>

/** 页面卸载时的兜底发送，返回浏览器是否接下了这次投递。 */
type SendBeacon = (payload: {
  distinct_id: string
  session_id?: string
  events: QueuedEvent[]
}) => boolean

/**
 * 事件队列：攒批入队，满一批或到间隔时发送，失败按指数退避重试。
 *
 * 每条事件带 `event_id` 幂等键，重发不会在服务端产生重复。
 */
export class EventQueue {
  /** 本地状态的命名空间。调用方据此判断绑定项目变化后要不要重建队列。 */
  readonly namespace: string

  private readonly options: Required<Omit<AnalyticsOptions, "storage" | "namespace">> & {
    storage: AnalyticsStorage
  }
  private readonly keyPrefix: string
  private readonly send: SendBatch
  private readonly beacon: SendBeacon | null

  private queue: QueuedEvent[] = []
  private distinctId: string | null = null
  private sessionId: string | null = null
  private lastEventAt = 0
  private optedOut = false
  private consented: boolean
  private timer: ReturnType<typeof setTimeout> | null = null
  private flushing = false
  private failures = 0
  private unloadHooked = false

  /**
   * @param namespace 本地状态的命名空间，由 {@link analyticsNamespace} 算出
   * @param send 实际发送函数
   * @param options 采集配置
   * @param beacon 页面卸载时的兜底发送函数，非浏览器环境传 null
   */
  constructor(
    namespace: string,
    send: SendBatch,
    options: AnalyticsOptions = {},
    beacon: SendBeacon | null = null,
  ) {
    const persistence = options.persistence ?? "device"
    const resolved = options.namespace ?? namespace
    this.options = {
      enabled: options.enabled ?? true,
      requireConsent: options.requireConsent ?? false,
      persistence,
      respectDoNotTrack: options.respectDoNotTrack ?? true,
      flushIntervalMs: options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      batchSize: Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, SERVER_BATCH_MAX),
      maxQueueSize: options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
      sessionTimeoutMs: options.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS,
      storage:
        options.storage ??
        (persistence === "device"
          ? defaultStorage(resolved)
          : persistence === "session"
            ? memoryStorage()
            : nullStorage()),
    }
    this.namespace = resolved
    this.keyPrefix = `verhub.analytics.${resolved}.`
    this.send = send
    this.beacon = beacon
    this.consented = !this.options.requireConsent

    this.optedOut = this.options.storage.read(`${this.keyPrefix}opt_out`) === "1"

    if (this.active()) {
      this.restoreQueue()
      this.hookUnload()
    }
  }

  /**
   * 在浏览器里挂上 `visibilitychange` 与 `pagehide` 监听，页面进入隐藏或卸载时
   * 用 beacon 把队列送出去。两者都触发时由服务端的幂等键去重。
   */
  private hookUnload(): void {
    if (this.unloadHooked || !this.beacon) {
      return
    }
    const doc = (
      globalThis as {
        document?: {
          addEventListener?: (type: string, handler: () => void) => void
          visibilityState?: string
        }
      }
    ).document
    if (typeof doc?.addEventListener !== "function") {
      return
    }

    doc.addEventListener("visibilitychange", () => {
      if (doc.visibilityState !== "visible") {
        this.flushBeacon()
      }
    })
    // pagehide 在 window 上派发，挂到 document 上收不到。
    const win = globalThis as { addEventListener?: (type: string, handler: () => void) => void }
    win.addEventListener?.("pagehide", () => this.flushBeacon())
    this.unloadHooked = true
  }

  /**
   * 用 `sendBeacon` 把整个队列同步送出去，仅浏览器可用。
   *
   * 按 `batchSize` 分批；浏览器拒收时剩余事件留在队列里，等下次打开页面补发。
   */
  flushBeacon(): void {
    if (!this.beacon || !this.active() || this.queue.length === 0) {
      return
    }
    const distinctId = this.identity()
    if (!distinctId) {
      return
    }

    while (this.queue.length > 0) {
      const batch = this.queue.slice(0, this.options.batchSize)
      const accepted = this.beacon({
        distinct_id: distinctId,
        ...(this.sessionId ? { session_id: this.sessionId } : {}),
        events: batch,
      })
      if (!accepted) {
        break
      }
      this.queue.splice(0, batch.length)
    }
    this.persistQueue()
  }

  /** 当前是否会采集。为 false 时不生成标识、不落盘、不发请求。 */
  active(): boolean {
    if (!this.options.enabled || this.optedOut || !this.consented) {
      return false
    }
    return !(this.options.respectDoNotTrack && detectDoNotTrack())
  }

  /** 当前是否处于退出状态。 */
  hasOptedOut(): boolean {
    return this.optedOut
  }

  /** 停止采集、丢弃待发队列、删除本地匿名标识，并把退出标记写入本地。 */
  optOut(): void {
    this.optedOut = true
    this.consented = !this.options.requireConsent
    this.queue = []
    this.distinctId = null
    this.sessionId = null
    this.cancelTimer()
    this.options.storage.remove(`${this.keyPrefix}distinct_id`)
    this.options.storage.remove(`${this.keyPrefix}queue`)
    this.options.storage.write(`${this.keyPrefix}opt_out`, "1")
  }

  /** 撤销退出，并生成一个新的匿名标识。 */
  optIn(): void {
    this.optedOut = false
    this.options.storage.remove(`${this.keyPrefix}opt_out`)
    this.resetIdentity()
    this.hookUnload()
  }

  /** requireConsent 模式下开闸。在此之前不会有任何字节写入设备。 */
  grantConsent(): void {
    this.consented = true
    this.hookUnload()
  }

  /** 撤回同意，等价于 optOut() 并回到未同意状态。 */
  revokeConsent(): void {
    this.optOut()
    this.consented = false
  }

  /** 换一个新的匿名标识，切断与既往事件序列的关联。 */
  resetIdentity(): void {
    this.distinctId = null
    this.sessionId = null
    this.options.storage.remove(`${this.keyPrefix}distinct_id`)
  }

  /** 当前的匿名标识；未采集状态下返回 null，且不会顺带生成一个。 */
  currentDistinctId(): string | null {
    return this.active() ? this.identity() : null
  }

  /**
   * 入队一条事件，立即返回，不发起网络请求。
   *
   * 攒够 `batchSize` 条立即发送，否则排一个 `flushIntervalMs` 后的定时发送。
   *
   * @param name 事件名
   * @param properties 自定义属性
   */
  track(name: string, properties?: Record<string, unknown>): void {
    if (!this.active()) {
      return
    }

    this.queue.push({
      event_id: randomId(),
      name,
      occurred_at: Math.floor(Date.now() / 1000),
      ...(properties ? { properties } : {}),
    })

    if (this.queue.length > this.options.maxQueueSize) {
      this.queue.splice(0, this.queue.length - this.options.maxQueueSize)
    }

    this.touchSession()
    this.persistQueue()

    if (this.queue.length >= this.options.batchSize) {
      void this.flush()
    } else {
      this.scheduleFlush()
    }
  }

  /**
   * 立即发送队列里的所有事件。
   *
   * 失败的那一批留在队列里，按指数退避重排；已在发送中时直接返回。
   */
  async flush(): Promise<void> {
    if (this.flushing || !this.active() || this.queue.length === 0) {
      return
    }

    const distinctId = this.identity()
    if (!distinctId) {
      return
    }

    this.cancelTimer()
    this.flushing = true

    try {
      while (this.queue.length > 0) {
        const batch = this.queue.slice(0, this.options.batchSize)
        try {
          await this.send({
            distinct_id: distinctId,
            ...(this.sessionId ? { session_id: this.sessionId } : {}),
            events: batch,
          })
        } catch {
          this.failures += 1
          this.scheduleFlush(this.backoffMs())
          return
        }

        this.queue.splice(0, batch.length)
        this.failures = 0
        this.persistQueue()
      }
    } finally {
      this.flushing = false
    }
  }

  /** 匿名标识。persistence 为 "none" 时每次返回一个不落盘的临时标识。 */
  private identity(): string {
    if (this.distinctId) {
      return this.distinctId
    }

    const stored = this.options.storage.read(`${this.keyPrefix}distinct_id`)
    if (stored) {
      this.distinctId = stored
      return stored
    }

    const created = randomId()
    this.distinctId = created
    this.options.storage.write(`${this.keyPrefix}distinct_id`, created)
    return created
  }

  /** 空闲超过 sessionTimeoutMs 就换一个会话号。会话号从不落盘。 */
  private touchSession(): void {
    const now = Date.now()
    if (!this.sessionId || now - this.lastEventAt > this.options.sessionTimeoutMs) {
      this.sessionId = randomId()
    }
    this.lastEventAt = now
  }

  private scheduleFlush(delayMs = this.options.flushIntervalMs): void {
    if (this.timer) {
      return
    }
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, delayMs)
    // Node 下这个定时器不应吊住进程退出。
    ;(this.timer as { unref?: () => void }).unref?.()
  }

  private cancelTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /** 指数退避，封顶 MAX_BACKOFF_MS。 */
  private backoffMs(): number {
    return Math.min(this.options.flushIntervalMs * 2 ** (this.failures - 1), MAX_BACKOFF_MS)
  }

  private persistQueue(): void {
    if (this.options.persistence !== "device") {
      return
    }
    try {
      this.options.storage.write(`${this.keyPrefix}queue`, JSON.stringify(this.queue))
    } catch {
      /* 存不下不影响本次发送 */
    }
  }

  /** 启动时把上次没发出去的事件读回来，并排一次发送。 */
  private restoreQueue(): void {
    if (this.options.persistence !== "device") {
      return
    }
    const raw = this.options.storage.read(`${this.keyPrefix}queue`)
    if (!raw) {
      return
    }
    try {
      const parsed = JSON.parse(raw) as QueuedEvent[]
      if (Array.isArray(parsed) && parsed.length) {
        this.queue = parsed.slice(-this.options.maxQueueSize)
        this.scheduleFlush()
      }
    } catch {
      this.options.storage.remove(`${this.keyPrefix}queue`)
    }
  }
}

export type { Platform }
