// 本文件由 sdk/vanilla-js/build.mjs 从 verhub-sdk.js 生成，请勿手改。
;(function (root, factory) {
  factory(root)
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
/**
 * Verhub 纯 JS SDK（ES module）。
 *
 * 接口面与 Python / TypeScript / Rust 版一一对应。零依赖、零构建，直接 import
 * 或用 <script> 引 verhub-sdk.global.js。契约以仓库根目录的
 * verhub.openapi.yaml 为准。
 *
 * 本文件是 verhub-sdk.global.js 的生成源，`node build.mjs` 会把文件末尾那条
 * export 语句换成全局赋值，因此整份文件里只允许出现那一处 export。
 */

const VERHUB_SDK_VERSION = "0.2.9"

/** 客户端平台声明头。仅用于服务端请求统计，不影响接口返回内容。 */
const PLATFORM_HEADER = "x-verhub-platform"

/** 客户端系统版本明细头，如 `11` / `ubuntu 24.04`；超过 32 字符会被服务端丢弃。 */
const PLATFORM_VERSION_HEADER = "x-verhub-platform-version"

/** 系统版本明细的长度上限，与服务端一致。 */
const MAX_PLATFORM_VERSION_LENGTH = 32

/**
 * 把系统版本明细规整成能进 HTTP 头的形式。
 *
 * 非可打印 ASCII 一律替换成空格，折叠连续空白，按 MAX_PLATFORM_VERSION_LENGTH
 * 截断。四个语言的 SDK 规则相同。
 *
 * @param {string} value 原始声明
 * @returns {string} 清洗后的值；空串表示无从得知
 */
function sanitizePlatformVersion(value) {
  return String(value || "")
    .replace(/[^\x21-\x7e]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_PLATFORM_VERSION_LENGTH)
    .trimEnd()
}

/**
 * sanitizePlatformVersion 的 null 版：洗完是空串则返回 null。
 *
 * @param {string | null | undefined} value 原始声明
 * @returns {string | null}
 */
function headerSafe(value) {
  return value ? sanitizePlatformVersion(value) || null : null
}

/** 默认重试次数。 */
const DEFAULT_RETRIES = 2

/** 会触发重试的服务端状态码。 */
const RETRY_STATUS = new Set([502, 503, 504])

/** 会自动重试的幂等方法；其余方法一律不重试。 */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD"])

/** 所有 SDK 异常的基类，可用于一次性捕获。 */
class VerhubError extends Error {
  /**
   * @param {string} message 错误信息
   */
  constructor(message) {
    super(message)
    this.name = "VerhubError"
  }
}

/**
 * 调用需要凭据的接口时未设置 token，请求未发出。
 *
 * 不继承 VerhubApiError，`instanceof VerhubApiError` 不会命中本类。
 */
class VerhubAuthError extends VerhubError {
  /**
   * @param {string} message 错误信息
   */
  constructor(message) {
    super(message)
    this.name = "VerhubAuthError"
  }
}

/** 服务端返回了非 2xx 响应。 */
class VerhubApiError extends VerhubError {
  /**
   * @param {string} message 错误信息，优先取响应体的 message 字段
   * @param {number} status HTTP 状态码
   * @param {unknown} body 已解析的响应体
   */
  constructor(message, status, body = null) {
    super(message)
    this.name = "VerhubApiError"
    this.status = status
    this.body = body
  }
}

/** 请求没能到达服务端（超时、DNS、连接被拒等）。 */
class VerhubConnectionError extends VerhubError {
  /**
   * @param {string} message 错误信息
   * @param {unknown} cause 底层异常
   */
  constructor(message, cause) {
    super(message)
    this.name = "VerhubConnectionError"
    this.cause = cause
  }
}

/** 宿主系统名 → 契约平台值。表里没有的一律 others。 */
const OS_TO_PLATFORM = {
  win32: "windows",
  windows: "windows",
  darwin: "macos",
  linux: "linux",
  android: "android",
}

/** Windows NT 内核号 → 市场版本号。10.0 不在表内，另按构建号区分。 */
const WINDOWS_NT_TO_MARKET = { 6.1: "7", 6.2: "8", 6.3: "8.1" }

/** Darwin 内核大版本 → macOS 市场版本号。 */
const DARWIN_TO_MACOS = {
  25: "26",
  24: "15",
  23: "14",
  22: "13",
  21: "12",
  20: "11",
  19: "10.15",
  18: "10.14",
  17: "10.13",
  16: "10.12",
}

/**
 * 运行在服务端 JS 运行时（Node / Bun / Deno）时返回宿主系统名。
 *
 * @returns {string | undefined} 浏览器里为 undefined
 */
function hostOsName() {
  const proc = globalThis.process
  if (proc && proc.versions && proc.versions.node && proc.platform) {
    return proc.platform
  }

  return globalThis.Deno && globalThis.Deno.build ? globalThis.Deno.build.os : undefined
}

/**
 * 同步取 Node 内建模块。
 *
 * @param {string} name 模块名
 * @returns {any} 浏览器里取不到，返回 undefined
 */
function loadNodeBuiltin(name) {
  const proc = globalThis.process
  try {
    if (proc && typeof proc.getBuiltinModule === "function") {
      return proc.getBuiltinModule(name)
    }
  } catch {
    /* 取不到就当没有 */
  }
  try {
    if (typeof globalThis.require === "function") {
      return globalThis.require(name)
    }
  } catch {
    /* 同上 */
  }
  return undefined
}

/**
 * 探测当前运行平台，用于填充 PLATFORM_HEADER。
 *
 * 浏览器与 Worker 记作 web，识别不出的宿主系统记作 others。
 *
 * @returns {string}
 */
function detectPlatform() {
  const os = hostOsName()
  if (os === undefined) {
    return typeof navigator === "undefined" ? "others" : "web"
  }

  return OS_TO_PLATFORM[os] || "others"
}

/** 读 /etc/os-release，拼成 `发行版 版本号`（如 ubuntu 24.04）。 */
function linuxDistroVersion() {
  const fs = loadNodeBuiltin("node:fs")
  if (!fs || typeof fs.readFileSync !== "function") {
    return ""
  }
  try {
    const text = String(fs.readFileSync("/etc/os-release", "utf8"))
    const unquote = (value) => (value || "").trim().replace(/^["']|["']$/g, "")
    const id = unquote((/^ID=(.*)$/m.exec(text) || [])[1]).toLowerCase()
    const version = unquote((/^VERSION_ID=(.*)$/m.exec(text) || [])[1])
    return sanitizePlatformVersion(`${id} ${version}`)
  } catch {
    return ""
  }
}

/**
 * 探测系统版本明细，用于填充 PLATFORM_VERSION_HEADER。
 *
 * Windows 与 macOS 给市场版本号（11 / 15 / 10.15），Linux 给 `发行版 版本号`。
 * 浏览器与取不到系统信息时返回空串。
 *
 * @returns {string}
 */
function detectPlatformVersion() {
  const os = hostOsName()
  if (os === undefined) {
    return ""
  }

  const nodeOs = loadNodeBuiltin("node:os")
  if (!nodeOs || typeof nodeOs.release !== "function") {
    return ""
  }

  try {
    const release = String(nodeOs.release() || "")
    if (os === "win32" || os === "windows") {
      const win10 = /^10\.0\.(\d+)/.exec(release)
      if (win10) {
        return Number(win10[1]) >= 22000 ? "11" : "10"
      }
      const nt = (/^(\d+\.\d+)/.exec(release) || [])[1]
      return (nt && WINDOWS_NT_TO_MARKET[nt]) || ""
    }
    if (os === "darwin") {
      const major = (/^(\d+)/.exec(release) || [])[1]
      return (major && DARWIN_TO_MACOS[major]) || ""
    }
    if (os === "linux" || os === "android") {
      return linuxDistroVersion()
    }
  } catch {
    /* 探测失败时不声明版本 */
  }

  return ""
}

/**
 * 丢掉值为 undefined 的字段，保留显式的 null。
 *
 * @param {Record<string, unknown>} input 原始字段表
 * @returns {Record<string, unknown>}
 */
function compact(input) {
  const out = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      out[key] = value
    }
  }
  return out
}

/**
 * 去掉首尾空白与末尾斜杠；不含 /api/v 时 console.warn 一次，不抛错。
 *
 * @param {string} baseUrl 原始根地址
 * @returns {string} 规范化后的根地址
 */
function normalizeBaseUrl(baseUrl) {
  const normalized = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "")
  if (!normalized.includes("/api/v")) {
    console.warn(
      `verhub: baseUrl 通常应以 /api/v1 结尾，当前为 "${normalized}"；若非有意为之，请求可能全部 404`,
    )
  }
  return normalized
}

/** 底层 HTTP 客户端，两个命名空间共用一份连接、凭据与来源声明。 */
class HttpClient {
  /**
   * @param {{
   *   baseUrl: string,
   *   projectKey?: string,
   *   token?: string,
   *   platform?: string | null,
   *   platformVersion?: string | null,
   *   timeoutMs?: number,
   *   retries?: number,
   *   fetch?: typeof fetch,
   *   headers?: Record<string, string>,
   *   appIdentifier?: string,
   *   logger?: (event: {method: string, url: string, status?: number, attempt: number}) => void,
   * }} options 客户端配置
   */
  constructor(options) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.projectKey = options.projectKey
    this.token = options.token || ""
    this.timeoutMs = options.timeoutMs === undefined ? 15000 : options.timeoutMs
    this.retries = options.retries === undefined ? DEFAULT_RETRIES : options.retries
    this.extraHeaders = options.headers || {}
    this.logger = options.logger

    const appId = options.appIdentifier ? String(options.appIdentifier).trim() : ""
    this.userAgent = hostOsName()
      ? `verhub-sdk-js/${VERHUB_SDK_VERSION}${appId ? ` ${appId}` : ""}`
      : null

    this.platform = headerSafe(options.platform === undefined ? detectPlatform() : options.platform)

    if (options.platformVersion === undefined) {
      this.platformVersion = this.platform ? headerSafe(detectPlatformVersion()) : null
    } else {
      this.platformVersion = headerSafe(options.platformVersion)
    }

    const fetcher = options.fetch || globalThis.fetch
    if (typeof fetcher !== "function") {
      throw new TypeError("当前环境没有全局 fetch，请通过 options.fetch 传入实现")
    }
    // 部分实现要求 fetch 以全局对象为 this。
    this.fetcher = fetcher.bind(globalThis)
  }

  /**
   * @param {string} token 管理员 JWT 或 API Key
   */
  setToken(token) {
    this.token = token
  }

  /** 清除当前凭据，之后调用 admin 接口会抛 VerhubAuthError。 */
  clearToken() {
    this.token = ""
  }

  /**
   * @param {string} projectKey 新的绑定项目标识
   */
  setProjectKey(projectKey) {
    this.projectKey = projectKey
  }

  /**
   * @param {string | null} platform 平台声明；传 null 则不再声明平台
   */
  setPlatform(platform) {
    this.platform = headerSafe(platform)
  }

  /**
   * @param {string | null} platformVersion 系统版本明细；传 null 则不再声明
   */
  setPlatformVersion(platformVersion) {
    this.platformVersion = headerSafe(platformVersion)
  }

  /**
   * @returns {string} 绑定的项目标识
   * @throws {VerhubError} 未绑定 projectKey
   */
  requireProjectKey() {
    if (!this.projectKey) {
      throw new VerhubError("未设置 projectKey：请在创建客户端时传入，或调用 setProjectKey()")
    }
    return this.projectKey
  }

  /**
   * 拼出可直接交给 navigator.sendBeacon 的请求地址。
   *
   * @param {string} pathTemplate 形如 `/public/{projectKey}/events` 的路径模板
   * @param {Record<string, string>} [pathParams] 路径参数
   * @returns {string}
   */
  resolveUrl(pathTemplate, pathParams) {
    return `${this.baseUrl}${this.resolvePath(pathTemplate, pathParams)}`
  }

  /**
   * @param {string} method HTTP 方法
   * @param {string} pathTemplate 形如 `/public/{projectKey}` 的路径模板
   * @param {{pathParams?: Record<string, string>, query?: Record<string, unknown>, body?: unknown, auth?: boolean}} [options] 请求参数
   * @returns {Promise<unknown>}
   */
  async request(method, pathTemplate, options = {}) {
    const url = this.buildUrl(this.resolvePath(pathTemplate, options.pathParams), options.query)

    const headers = Object.assign(
      { Accept: "application/json" },
      // 浏览器会丢弃脚本设置的 User-Agent，只在服务端运行时带上。
      this.userAgent ? { "User-Agent": this.userAgent } : {},
      this.extraHeaders,
    )

    if (this.platform) {
      headers[PLATFORM_HEADER] = this.platform
    }
    if (this.platformVersion) {
      headers[PLATFORM_VERSION_HEADER] = this.platformVersion
    }

    if (options.auth) {
      if (!this.token) {
        throw new VerhubAuthError("缺少凭据：请先设置 token")
      }
      headers.Authorization = `Bearer ${this.token}`
    }

    let body
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(options.body)
    }

    const canRetry = IDEMPOTENT_METHODS.has(method) && this.retries > 0
    const maxAttempts = canRetry ? this.retries + 1 : 1

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (this.logger) {
        this.logger({ method, url, attempt })
      }

      let response
      try {
        response = await this.fetchOnce(method, url, headers, body)
      } catch (cause) {
        if (canRetry && attempt < maxAttempts) {
          await this.backoff(attempt)
          continue
        }
        throw cause
      }

      if (this.logger) {
        this.logger({ method, url, status: response.status, attempt })
      }

      if (RETRY_STATUS.has(response.status) && canRetry && attempt < maxAttempts) {
        await this.backoff(attempt)
        continue
      }

      const raw = await response.text()
      const payload = this.parseJson(raw)
      if (!response.ok) {
        const message = this.errorMessage(payload) || `请求失败，HTTP ${response.status}`
        throw new VerhubApiError(message, response.status, payload)
      }
      return payload
    }

    // 循环必然 return 或 throw，这行只为兜底。
    throw new VerhubConnectionError(`请求 ${method} ${url} 失败：重试耗尽`, undefined)
  }

  /**
   * 发一次请求，带独立的超时控制；失败按连接错误抛出。
   *
   * @param {string} method HTTP 方法
   * @param {string} url 完整 URL
   * @param {Record<string, string>} headers 请求头
   * @param {string | undefined} body 请求体
   * @returns {Promise<Response>}
   */
  async fetchOnce(method, url, headers, body) {
    const controller = this.timeoutMs > 0 ? new AbortController() : undefined
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined

    try {
      return await this.fetcher(url, {
        method,
        headers,
        body,
        signal: controller ? controller.signal : undefined,
      })
    } catch (cause) {
      const reason =
        controller && controller.signal.aborted ? `超时（${this.timeoutMs}ms）` : String(cause)
      throw new VerhubConnectionError(`请求 ${method} ${url} 失败：${reason}`, cause)
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }
  }

  /**
   * 指数退避：第 n 次重试前等 300 * 2^(n-1) 毫秒。
   *
   * @param {number} attempt 当前尝试次数
   * @returns {Promise<void>}
   */
  backoff(attempt) {
    const ms = 300 * 2 ** (attempt - 1)
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * @param {string} template 路径模板
   * @param {Record<string, string>} [params] 路径参数
   * @returns {string}
   */
  resolvePath(template, params) {
    return template.replace(/\{([^}]+)\}/g, (_match, key) => {
      const value = params ? params[key] : undefined
      if (value === undefined || value === "") {
        throw new TypeError(`缺少路径参数：${key}`)
      }
      return encodeURIComponent(value)
    })
  }

  /**
   * @param {string} path 已填充的路径
   * @param {Record<string, unknown>} [query] 查询参数，值为 null / undefined 的项会被丢弃
   * @returns {string}
   */
  buildUrl(path, query) {
    if (!query) {
      return `${this.baseUrl}${path}`
    }

    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue
      }
      params.set(key, String(value))
    }

    const queryString = params.toString()
    return queryString ? `${this.baseUrl}${path}?${queryString}` : `${this.baseUrl}${path}`
  }

  /**
   * @param {string} raw 原始响应文本
   * @returns {unknown} 解析结果；不是 JSON 时原样返回文本
   */
  parseJson(raw) {
    if (!raw) {
      return {}
    }

    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  /**
   * @param {unknown} body 已解析的响应体；NestJS 校验失败时 message 是字符串数组
   * @returns {string | null}
   */
  errorMessage(body) {
    if (!body || typeof body !== "object") {
      return null
    }

    if (typeof body.message === "string") {
      return body.message
    }
    if (Array.isArray(body.message) && body.message.length > 0) {
      return body.message.map(String).join("; ")
    }

    return null
  }
}

/* ---- 事件采集 ---- */

/**
 * 事件采集的本地状态：匿名标识、退出标记与待发送队列。
 *
 * 这是整个 SDK 里唯一会在设备上写入数据的部分；改动这里要同步更新
 * 《SDK 合规性文档》。
 */

const DEFAULT_FLUSH_INTERVAL_MS = 5000
const DEFAULT_BATCH_SIZE = 20
const DEFAULT_MAX_QUEUE_SIZE = 500
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000

/** 服务端单批上限，与 VERHUB_EVENT_BATCH_MAX 的默认值一致。 */
const SERVER_BATCH_MAX = 50

/** 重试退避的上限。 */
const MAX_BACKOFF_MS = 60000

/**
 * 取 baseUrl 的 origin（协议 + 主机 + 端口），路径一律忽略。
 *
 * 主机名与协议转小写，剥掉 userinfo，http 的 80 与 https 的 443 会被省略。
 * 不含 `://` 的输入原样转小写返回。四个语言的 SDK 规则相同。
 *
 * @param {string} baseUrl 已规范化（去首尾空白、去末尾斜杠）的根地址
 * @returns {string}
 */
function originOf(baseUrl) {
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
 *
 * @param {string} input 输入串
 * @returns {string}
 */
function fnv1a32Hex(input) {
  const bytes = new TextEncoder().encode(input)
  let hash = 0x811c9dc5
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i]
    // 乘 16777619，用移位避免 32 位溢出后的精度丢失。
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

/**
 * 本地状态的命名空间：`<origin 哈希>-<小写 projectKey>`。
 *
 * projectKey 去首尾空白后转小写；为空或只有空白时用 default。
 * 四个语言的 SDK 对同一组入参给出同一结果。
 *
 * @param {string} baseUrl 规范化后的根地址
 * @param {string} [projectKey] 绑定的项目标识
 * @returns {string}
 */
function analyticsNamespace(baseUrl, projectKey) {
  const key =
    String(projectKey ?? "default")
      .trim()
      .toLowerCase() || "default"
  return `${fnv1a32Hex(originOf(baseUrl))}-${key}`
}

/** 进程内存储，persistence: "session" 用，也是拿不到 localStorage 时的回退。 */
function memoryStorage() {
  const map = new Map()
  return {
    read: (key) => (map.has(key) ? map.get(key) : null),
    write: (key, value) => {
      map.set(key, value)
    },
    remove: (key) => {
      map.delete(key)
    },
  }
}

/** 什么都不存的实现，persistence: "none" 用。 */
function nullStorage() {
  return { read: () => null, write: () => {}, remove: () => {} }
}

/** 浏览器里用 localStorage；不可用或写不进去时退回内存。 */
function defaultStorage() {
  const ls = typeof localStorage === "undefined" ? null : localStorage
  if (!ls) {
    return memoryStorage()
  }
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

/** 随机 UUIDv4。不读取任何设备特征。 */
function randomId() {
  const cryptoObj = typeof crypto === "undefined" ? null : crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID()
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`
}

/**
 * 浏览器的退出信号：GPC 或 DNT 打开时为 true。非浏览器环境恒为 false。
 *
 * @returns {boolean}
 */
function detectDoNotTrack() {
  if (typeof navigator === "undefined") {
    return false
  }
  return navigator.globalPrivacyControl === true || navigator.doNotTrack === "1"
}

/**
 * 事件队列：攒批入队，满一批或到间隔时发送，失败按指数退避重试。
 *
 * 每条事件带 event_id 幂等键，重发不会在服务端产生重复。
 */
class EventQueue {
  /**
   * @param {string} namespace 本地状态的命名空间，由 analyticsNamespace() 算出
   * @param {(payload: object) => Promise<unknown>} send 实际发送函数
   * @param {object} [options] 采集配置
   * @param {((payload: object) => boolean) | null} [beacon] 页面卸载时的兜底发送函数
   */
  constructor(namespace, send, options = {}, beacon = null) {
    const persistence = options.persistence || "device"
    const resolved = options.namespace || namespace
    this.options = {
      enabled: options.enabled !== false,
      requireConsent: options.requireConsent === true,
      persistence,
      respectDoNotTrack: options.respectDoNotTrack !== false,
      flushIntervalMs: options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      batchSize: Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, SERVER_BATCH_MAX),
      maxQueueSize: options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
      sessionTimeoutMs: options.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS,
      storage:
        options.storage ||
        (persistence === "device"
          ? defaultStorage()
          : persistence === "session"
            ? memoryStorage()
            : nullStorage()),
    }
    /** 本地状态的命名空间。调用方据此判断绑定项目变化后要不要重建队列。 */
    this.namespace = resolved
    this.keyPrefix = `verhub.analytics.${resolved}.`
    this.send = send
    this.beacon = beacon
    this.unloadHooked = false

    this.queue = []
    this.distinctId = null
    this.sessionId = null
    this.lastEventAt = 0
    this.timer = null
    this.flushing = false
    this.failures = 0
    this.consented = !this.options.requireConsent

    this.optedOut = this.options.storage.read(`${this.keyPrefix}opt_out`) === "1"

    if (this.active()) {
      this.restoreQueue()
      this.hookUnload()
    }
  }

  /**
   * 挂上 visibilitychange 与 pagehide 监听，页面进入隐藏或卸载时用 beacon 把
   * 队列送出去。两者都触发时由服务端的幂等键去重。
   */
  hookUnload() {
    if (this.unloadHooked || !this.beacon || typeof document === "undefined") {
      return
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") {
        this.flushBeacon()
      }
    })
    // pagehide 在 window 上派发，挂到 document 上收不到。
    if (typeof globalThis.addEventListener === "function") {
      globalThis.addEventListener("pagehide", () => this.flushBeacon())
    }
    this.unloadHooked = true
  }

  /**
   * 用 sendBeacon 把整个队列同步送出去，仅浏览器可用。
   *
   * 按 batchSize 分批；浏览器拒收时剩余事件留在队列里，等下次打开页面补发。
   */
  flushBeacon() {
    if (!this.beacon || !this.active() || this.queue.length === 0) {
      return
    }
    const distinctId = this.identity()
    if (!distinctId) {
      return
    }

    while (this.queue.length > 0) {
      const batch = this.queue.slice(0, this.options.batchSize)
      const payload = { distinct_id: distinctId, events: batch }
      if (this.sessionId) {
        payload.session_id = this.sessionId
      }
      if (!this.beacon(payload)) {
        break
      }
      this.queue.splice(0, batch.length)
    }
    this.persistQueue()
  }

  /** 当前是否会采集。为 false 时不生成标识、不落盘、不发请求。 */
  active() {
    if (!this.options.enabled || this.optedOut || !this.consented) {
      return false
    }
    return !(this.options.respectDoNotTrack && detectDoNotTrack())
  }

  /** @returns {boolean} 当前是否处于退出状态 */
  hasOptedOut() {
    return this.optedOut
  }

  /** 停止采集、丢弃待发队列、删除本地匿名标识，并把退出标记写入本地。 */
  optOut() {
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
  optIn() {
    this.optedOut = false
    this.options.storage.remove(`${this.keyPrefix}opt_out`)
    this.resetIdentity()
    this.hookUnload()
  }

  /** requireConsent 模式下开闸。在此之前不会有任何字节写入设备。 */
  grantConsent() {
    this.consented = true
    this.hookUnload()
  }

  /** 撤回同意，等价于 optOut() 并回到未同意状态。 */
  revokeConsent() {
    this.optOut()
    this.consented = false
  }

  /** 换一个新的匿名标识，切断与既往事件序列的关联。 */
  resetIdentity() {
    this.distinctId = null
    this.sessionId = null
    this.options.storage.remove(`${this.keyPrefix}distinct_id`)
  }

  /** 当前的匿名标识；未采集状态下返回 null，且不会顺带生成一个。 */
  currentDistinctId() {
    return this.active() ? this.identity() : null
  }

  /**
   * 入队一条事件，立即返回，不发起网络请求。
   *
   * 攒够 batchSize 条立即发送，否则排一个 flushIntervalMs 后的定时发送。
   *
   * @param {string} name 事件名
   * @param {object} [properties] 自定义属性
   */
  track(name, properties) {
    if (!this.active()) {
      return
    }

    const event = {
      event_id: randomId(),
      name,
      occurred_at: Math.floor(Date.now() / 1000),
    }
    if (properties) {
      event.properties = properties
    }
    this.queue.push(event)

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
  async flush() {
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
        const payload = { distinct_id: distinctId, events: batch }
        if (this.sessionId) {
          payload.session_id = this.sessionId
        }

        try {
          await this.send(payload)
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
  identity() {
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
  touchSession() {
    const now = Date.now()
    if (!this.sessionId || now - this.lastEventAt > this.options.sessionTimeoutMs) {
      this.sessionId = randomId()
    }
    this.lastEventAt = now
  }

  /**
   * 排一次定时发送；已有定时器时不重排。
   *
   * @param {number} [delayMs] 延迟毫秒数，省略则用 flushIntervalMs
   */
  scheduleFlush(delayMs) {
    if (this.timer) {
      return
    }
    this.timer = setTimeout(
      () => {
        this.timer = null
        void this.flush()
      },
      delayMs === undefined ? this.options.flushIntervalMs : delayMs,
    )
    // Node 下这个定时器不应吊住进程退出。
    if (this.timer && typeof this.timer.unref === "function") {
      this.timer.unref()
    }
  }

  /** 取消待触发的定时发送。 */
  cancelTimer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /** 指数退避，封顶 MAX_BACKOFF_MS。 */
  backoffMs() {
    return Math.min(this.options.flushIntervalMs * 2 ** (this.failures - 1), MAX_BACKOFF_MS)
  }

  /** 把当前队列写入本地，persistence 非 "device" 时是空操作。 */
  persistQueue() {
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
  restoreQueue() {
    if (this.options.persistence !== "device") {
      return
    }
    const raw = this.options.storage.read(`${this.keyPrefix}queue`)
    if (!raw) {
      return
    }
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length) {
        this.queue = parsed.slice(-this.options.maxQueueSize)
        this.scheduleFlush()
      }
    } catch {
      this.options.storage.remove(`${this.keyPrefix}queue`)
    }
  }
}

/**
 * 公开接口，不需要凭据。
 *
 * 项目作用域的方法用客户端绑定的 projectKey，不再逐次收项目参数。
 */
class PublicApi {
  /**
   * @param {HttpClient} http 底层 HTTP 客户端
   * @param {object} [analytics] 事件采集配置；省略则用默认值（设备级持久化 + 本地队列）
   */
  constructor(http, analytics = {}) {
    this.http = http
    this.analyticsOptions = analytics
    this.queue = null
  }

  /**
   * @param {{locale?: string}} [options] 语言偏好。命中项目注册的语言且该语言译文填了
   *   对应字段时，`name` / `description` 返回译文，返回体的 `locale` 标出实际语言；
   *   否则回落项目自身的值。
   */
  getProject(options = {}) {
    return this.http.request("GET", "/public/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { locale: options.locale },
    })
  }

  /**
   * @param {{limit?: number, offset?: number, locale?: string}} [options] 分页参数与语言偏好。
   *   `locale` 命中项目注册的语言且该版本有译文时，`title` / `content` 返回译文，
   *   返回项的 `locale` 标出实际语言；否则回落版本自身的内容（`locale` 为 null）。
   */
  listVersions(options = {}) {
    return this.http.request("GET", "/public/{projectKey}/versions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset, locale: options.locale },
    })
  }

  /**
   * @param {{locale?: string}} [options] 语言偏好，语义同 `listVersions`
   * @returns 最新正式版本
   */
  getLatestVersion(options = {}) {
    return this.http.request("GET", "/public/{projectKey}/versions/latest", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { locale: options.locale },
    })
  }

  /**
   * @param {{locale?: string}} [options] 语言偏好，语义同 `listVersions`
   * @returns 最新 preview 版本；没有则为 null
   */
  getLatestPreviewVersion(options = {}) {
    return this.http.request("GET", "/public/{projectKey}/versions/latest-preview", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { locale: options.locale },
    })
  }

  /**
   * @param {string} version 版本号，如 `1.2.0`
   * @param {{locale?: string}} [options] 语言偏好，语义同 `listVersions`
   */
  getVersion(version, options = {}) {
    return this.http.request("GET", "/public/{projectKey}/versions/by-version/{version}", {
      pathParams: { projectKey: this.http.requireProjectKey(), version },
      query: { locale: options.locale },
    })
  }

  /**
   * 提交当前版本并检查更新。
   *
   * current_version 与 current_comparable_version 至少提供一个。只给
   * current_version 时服务端按版本号查库取其登记的可比较版本号，该版本未登记
   * 会返回 400；两者都给时以 current_comparable_version 为准。
   *
   * @param {{current_version?: string, current_comparable_version?: string, include_preview?: boolean, locale?: string}} options 当前版本与比较选项。
   *   `locale` 命中项目注册的语言时，响应里 latest_version / latest_preview_version /
   *   target_version 三个版本对象的 title 与 content 都返回对应译文。
   */
  checkUpdate(options) {
    return this.http.request("POST", "/public/{projectKey}/versions/check-update", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, options)),
    })
  }

  /**
   * @param {{limit?: number, offset?: number, platform?: string, version?: string, locale?: string}} [options]
   *   分页、平台、客户端版本号与语言偏好。
   *   `version` 不传时，所有设了可见版本范围的公告都不会返回；
   *   `locale` 未注册或该公告无译文时回落到默认内容（返回项的 `locale` 为 null）。
   */
  listAnnouncements(options = {}) {
    return this.http.request("GET", "/public/{projectKey}/announcements", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: {
        limit: options.limit,
        offset: options.offset,
        platform: options.platform,
        version: options.version,
        locale: options.locale,
      },
    })
  }

  /**
   * @param {{platform?: string, version?: string, locale?: string}} [options] 平台、客户端版本号与语言偏好
   */
  getLatestAnnouncement(options = {}) {
    return this.http.request("GET", "/public/{projectKey}/announcements/latest", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: {
        platform: options.platform,
        version: options.version,
        locale: options.locale,
      },
    })
  }

  /**
   * 取反馈提交选项，据此决定要不要显示「转发到 GitHub Issue」的勾选框。
   *
   * @returns 本项目是否开放转发，以及转发时联系方式是否必填
   */
  getFeedbackOptions() {
    return this.http.request("GET", "/public/{projectKey}/feedbacks/options", {
      pathParams: { projectKey: this.http.requireProjectKey() },
    })
  }

  /**
   * 提交用户反馈。
   *
   * forward_to_github 为 true 时联系方式必填，本地即拒绝；项目未开放转发时服务端
   * 返回 400，Issue 建失败时整条反馈不会被记录（503）。
   *
   * @param {{content: string, user_id?: string, rating?: number, contact?: string, forward_to_github?: boolean, is_hidden?: boolean, platform?: string, platform_version?: string, custom_data?: object}} input 反馈字段
   * @throws {VerhubError} 选了转发却没填 contact
   */
  createFeedback(input) {
    if (input.forward_to_github === true && !String(input.contact ?? "").trim()) {
      throw new VerhubError("转发到 GitHub Issue 需要联系方式：请先填写 contact")
    }
    return this.http.request("POST", "/public/{projectKey}/feedbacks", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, input)),
    })
  }

  /**
   * @param {{level: number, content: string, device_info?: object, custom_data?: object}} input 日志字段
   */
  uploadLog(input) {
    return this.http.request("POST", "/public/{projectKey}/logs", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, input)),
    })
  }

  // ---- 条款文档 ----

  /**
   * 列出全部条款文档的标题与最后更新时间，不含正文。
   *
   * 不作用于绑定项目，条款是实例级的。
   */
  listTerms() {
    return this.http.request("GET", "/public/terms")
  }

  /**
   * 取条款文档正文（Markdown）。实例未自定义时返回内置正文。
   *
   * @param {"privacy-policy" | "sdk-compliance"} slug 文档标识
   */
  getTerms(slug) {
    return this.http.request("GET", "/public/terms/{slug}", { pathParams: { slug } })
  }

  // ---- 事件采集 ----

  /**
   * 记录一次用户行为，入队即返回，不发起网络请求。
   *
   * 事件名无需预先登记，服务端第一次收到就自动建立定义。建议用小写下划线形式
   * （`checkout_clicked`）；服务端归一化为小写，只接受字母、数字、下划线、点、
   * 连字符与冒号。
   *
   * 队列满 batchSize 条或每 flushIntervalMs 毫秒发送一次；发送失败按指数退避
   * 重试，每条事件带幂等键。未同意、已退出、命中 GPC/DNT 或采集被关闭时本调用
   * 是空操作。
   *
   * @param {string} name 事件名
   * @param {object} [properties] 自定义属性，按属性统计只看第一层
   */
  track(name, properties) {
    this.events().track(name, properties)
  }

  /** 立即发送队列里的所有事件。页面卸载前调用可以避免丢掉最后一批。 */
  flush() {
    return this.events().flush()
  }

  /** 停止采集、丢弃待发队列、删除本地匿名标识，并把退出标记写入本地。 */
  optOut() {
    this.events().optOut()
  }

  /** 撤销退出，并生成一个新的匿名标识。 */
  optIn() {
    this.events().optIn()
  }

  /** @returns {boolean} 当前是否处于退出状态 */
  hasOptedOut() {
    return this.events().hasOptedOut()
  }

  /**
   * requireConsent 模式下开闸。在此之前 SDK 不采集、不写盘，含匿名标识的生成。
   */
  grantConsent() {
    this.events().grantConsent()
  }

  /** 撤回同意，等价于 optOut() 并回到未同意状态。 */
  revokeConsent() {
    this.events().revokeConsent()
  }

  /** 换一个新的匿名标识，切断与既往事件序列的关联。保持采集开启。 */
  resetIdentity() {
    this.events().resetIdentity()
  }

  /** 当前的匿名标识；未采集状态下为 null。 */
  get distinctId() {
    return this.events().currentDistinctId()
  }

  /**
   * 导出本机匿名标识下的全部事件明细（GDPR Art.15 / Art.20）。
   *
   * @param {string} [distinctId] 省略则用当前标识
   */
  exportMyData(distinctId) {
    return this.http.request("GET", "/public/{projectKey}/events/me", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { distinct_id: this.requireDistinctId(distinctId) },
    })
  }

  /**
   * 删除本机匿名标识下的全部事件明细（GDPR Art.17）。小时汇总不在删除范围内。
   *
   * @param {string} [distinctId] 省略则用当前标识
   */
  deleteMyData(distinctId) {
    return this.http.request("DELETE", "/public/{projectKey}/events/me", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { distinct_id: this.requireDistinctId(distinctId) },
    })
  }

  /**
   * 直接发一批事件，绕过本地队列。常规入口是 track()。
   *
   * @param {{distinct_id: string, session_id?: string, events: Array<object>}} payload 单批上限 50
   */
  ingestEvents(payload) {
    return this.http.request("POST", "/public/{projectKey}/events", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, payload)),
    })
  }

  /**
   * 首次访问时才建队列，命名空间变化时丢弃重建。
   *
   * 旧命名空间攒下的事件留在它自己的键下，下次绑定回去时补发。
   */
  events() {
    const namespace =
      (this.analyticsOptions && this.analyticsOptions.namespace) ||
      analyticsNamespace(this.http.baseUrl, this.http.projectKey)

    if (this.queue && this.queue.namespace !== namespace) {
      this.queue = null
    }
    if (!this.queue) {
      this.queue = new EventQueue(
        namespace,
        (payload) => this.ingestEvents(payload),
        this.analyticsOptions,
        (payload) => this.beaconEvents(payload),
      )
    }
    return this.queue
  }

  /**
   * 页面卸载时用 navigator.sendBeacon 把队列送出去，非浏览器环境返回 false。
   *
   * beacon 设不了请求头，平台与系统版本改走请求体。
   *
   * @param {object} payload 一批事件
   * @returns {boolean} 浏览器是否接下了这次投递
   */
  beaconEvents(payload) {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
      return false
    }
    const projectKey = this.http.projectKey
    if (!projectKey) {
      return false
    }

    const body = compact(
      Object.assign({}, payload, {
        platform: this.http.platform || undefined,
        platform_version: this.http.platformVersion || undefined,
      }),
    )

    try {
      const url = this.http.resolveUrl("/public/{projectKey}/events", { projectKey })
      const blob = new Blob([JSON.stringify(body)], { type: "application/json" })
      return navigator.sendBeacon(url, blob)
    } catch {
      return false
    }
  }

  /**
   * @param {string} [explicit] 显式指定的匿名标识
   * @returns {string}
   * @throws {VerhubError} 没有可用的匿名标识
   */
  requireDistinctId(explicit) {
    const id = explicit || this.events().currentDistinctId()
    if (!id) {
      throw new VerhubError("没有可用的匿名标识：事件采集未启用或已退出。可显式传入 distinctId。")
    }
    return id
  }
}

/**
 * 管理接口，全部需要凭据。
 *
 * 凭据可以是 `POST /auth/login` 拿到的管理员 JWT，也可以是后台签发的长期
 * API Key（vh_ 前缀）。网页里只用 public 命名空间，不要把管理凭据打进浏览器产物。
 *
 * 项目作用域的方法用客户端绑定的 projectKey，不再逐次收项目参数。
 */
class AdminApi {
  /**
   * @param {HttpClient} http 底层 HTTP 客户端
   */
  constructor(http) {
    this.http = http
  }

  // ---- 项目 ----

  /**
   * @param {{limit?: number, offset?: number}} [options] 分页参数
   */
  listProjects(options = {}) {
    return this.http.request("GET", "/admin/projects", {
      query: { limit: options.limit, offset: options.offset },
      auth: true,
    })
  }

  /**
   * 创建项目。input.project_key 是新项目标识，省略则用客户端绑定的那个。
   *
   * @param {object} input 项目字段
   */
  createProject(input) {
    return this.http.request("POST", "/admin/projects", {
      body: compact(
        Object.assign({}, input, {
          project_key: input.project_key || this.http.requireProjectKey(),
        }),
      ),
      auth: true,
    })
  }

  /**
   * @returns 绑定项目的详情
   */
  getProject() {
    return this.http.request("GET", "/admin/projects/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * 更新绑定的项目。提交 project_key 会改键；改键后旧 key 会自动登记为别名并继续
   * 指向本项目（旧 key 仍可访问），但客户端应 setProjectKey 切到新 key。
   *
   * @param {object} input 要改的字段
   */
  updateProject(input) {
    return this.http.request("PATCH", "/admin/projects/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * @returns 删除结果
   */
  deleteProject() {
    return this.http.request("DELETE", "/admin/projects/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /** 列出绑定项目的别名（改名保留的旧 Project Key）。 */
  listProjectAliases() {
    return this.http.request("GET", "/admin/projects/{projectKey}/aliases", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * 删除一个别名。删除后旧 key 不再指向本项目，此后以它访问会 404。
   *
   * @param {string} alias 要删除的别名（旧 Project Key）
   */
  deleteProjectAlias(alias) {
    return this.http.request("DELETE", "/admin/projects/{projectKey}/aliases/{alias}", {
      pathParams: { projectKey: this.http.requireProjectKey(), alias },
      auth: true,
    })
  }

  /**
   * 列出绑定项目注册的语言。只有注册过的语言能存公告译文，也只有它们的偏好
   * 会被公开接口认账——公开端收到未注册的语言偏好时返回公告的默认内容。
   */
  listProjectLocales() {
    return this.http.request("GET", "/admin/projects/{projectKey}/locales", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * 注册一个语言。已注册（大小写不敏感）时只更新展示名，不会新建第二行。
   *
   * @param {{locale: string, aliases?: string[], label?: string}} input
   *   语言标签、同义标签与展示名。同义标签让多个写法指向同一份译文
   *   （主标签 en 列出 en-US、en-GB）；与本项目其它语言相撞会 400。
   */
  createProjectLocale(input) {
    return this.http.request("POST", "/admin/projects/{projectKey}/locales", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * 注销一个语言。已录入的公告译文不会被删除，只是暂时不可达，重新注册即恢复。
   *
   * @param {string} locale 要注销的语言标签，匹配大小写不敏感
   */
  deleteProjectLocale(locale) {
    return this.http.request("DELETE", "/admin/projects/{projectKey}/locales/{locale}", {
      pathParams: { projectKey: this.http.requireProjectKey(), locale },
      auth: true,
    })
  }

  /** @returns 项目总数 */
  getProjectStatistics() {
    return this.http.request("GET", "/admin/projects/statistics", { auth: true })
  }

  /**
   * @param {string} repoUrl GitHub 仓库地址
   * @returns 可直接用于建项目的字段草稿
   */
  previewGithubRepo(repoUrl) {
    return this.http.request("GET", "/admin/projects/github-repo-preview", {
      query: { repo_url: repoUrl },
      auth: true,
    })
  }

  // ---- 版本 ----

  /**
   * @param {{limit?: number, offset?: number}} [options] 分页参数
   */
  listVersions(options = {}) {
    return this.http.request("GET", "/admin/projects/{projectKey}/versions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset },
      auth: true,
    })
  }

  /**
   * @param {object} input 版本字段，version 与 comparable_version 必填。
   *   `translations` 是标题与更新说明的译文数组（`{locale, title?, content?}`），
   *   传了即整体替换全部译文、空数组即清空；语言须先在项目里注册。
   */
  createVersion(input) {
    return this.http.request("POST", "/admin/projects/{projectKey}/versions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * @param {string} versionId 版本记录 id
   */
  getVersion(versionId) {
    return this.http.request("GET", "/admin/projects/{projectKey}/versions/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: versionId },
      auth: true,
    })
  }

  /**
   * 省略的字段保持原值；显式传 null 的字段被置空（如 download_url: null）。
   *
   * @param {string} versionId 版本记录 id
   * @param {object} input 要改的字段
   */
  updateVersion(versionId, input) {
    return this.http.request("PATCH", "/admin/projects/{projectKey}/versions/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: versionId },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * 按版本号创建或更新，适合在 CI 里幂等地发版。
   *
   * 目标版本号取自路径。新建时省略 comparable_version 会由版本号推导（去掉
   * 前导 v）；更新时省略的字段保持原值。
   *
   * @param {string} version 版本号
   * @param {object} [input] 版本字段
   */
  upsertVersion(version, input = {}) {
    return this.http.request("PUT", "/admin/projects/{projectKey}/versions/by-version/{version}", {
      pathParams: { projectKey: this.http.requireProjectKey(), version },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * @param {string} versionId 版本记录 id
   */
  deleteVersion(versionId) {
    return this.http.request("DELETE", "/admin/projects/{projectKey}/versions/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: versionId },
      auth: true,
    })
  }

  /** @returns 版本总量与时间跨度 */
  getVersionStatistics() {
    return this.http.request("GET", "/admin/versions/statistics", { auth: true })
  }

  /**
   * @param {{tag?: string}} [options] Release tag；省略则取最新一个
   */
  previewGithubRelease(options = {}) {
    return this.http.request(
      "GET",
      "/admin/projects/{projectKey}/versions/github-release-preview",
      {
        pathParams: { projectKey: this.http.requireProjectKey() },
        query: { tag: options.tag },
        auth: true,
      },
    )
  }

  /**
   * @returns 导入结果；已存在的版本计入 skipped
   */
  importGithubReleases() {
    return this.http.request(
      "POST",
      "/admin/projects/{projectKey}/versions/github-release-import",
      {
        pathParams: { projectKey: this.http.requireProjectKey() },
        auth: true,
      },
    )
  }

  // ---- 公告 ----

  /**
   * @param {{limit?: number, offset?: number}} [options] 分页参数
   */
  listAnnouncements(options = {}) {
    return this.http.request("GET", "/admin/projects/{projectKey}/announcements", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset },
      auth: true,
    })
  }

  /**
   * @param {{title: string, content: string, is_pinned?: boolean, is_hidden?: boolean, platforms?: string[], author?: string, min_comparable_version?: string|null, max_comparable_version?: string|null, translations?: Array<{locale: string, title?: string|null, content?: string|null, is_hidden?: boolean}>, published_at?: number}} input
   *   公告字段。`min/max_comparable_version` 是可见版本范围（闭区间，留空即该端不限）；
   *   `translations` 传了即整体替换全部译文，语言必须先在项目里注册。
   */
  createAnnouncement(input) {
    return this.http.request("POST", "/admin/projects/{projectKey}/announcements", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * @param {string} announcementId 公告 id
   */
  getAnnouncement(announcementId) {
    return this.http.request("GET", "/admin/projects/{projectKey}/announcements/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: announcementId },
      auth: true,
    })
  }

  /**
   * @param {string} announcementId 公告 id
   * @param {object} input 要改的字段
   */
  updateAnnouncement(announcementId, input) {
    return this.http.request("PATCH", "/admin/projects/{projectKey}/announcements/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: announcementId },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * @param {string} announcementId 公告 id
   */
  deleteAnnouncement(announcementId) {
    return this.http.request("DELETE", "/admin/projects/{projectKey}/announcements/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: announcementId },
      auth: true,
    })
  }

  /** @returns 公告总数与置顶数 */
  getAnnouncementStatistics() {
    return this.http.request("GET", "/admin/announcements/statistics", { auth: true })
  }

  // ---- 反馈 ----

  /**
   * @param {{limit?: number, offset?: number, include_hidden?: boolean}} [options] 分页参数与是否包含隐藏反馈
   */
  listFeedbacks(options = {}) {
    return this.http.request("GET", "/admin/projects/{projectKey}/feedbacks", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: {
        limit: options.limit,
        offset: options.offset,
        include_hidden: options.include_hidden,
      },
      auth: true,
    })
  }

  /**
   * 后台手动补录反馈。客户端上报请用 public.createFeedback。
   *
   * @param {object} input 反馈字段
   */
  createFeedback(input) {
    return this.http.request("POST", "/admin/projects/{projectKey}/feedbacks", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * @param {string} feedbackId 反馈 id
   */
  getFeedback(feedbackId) {
    return this.http.request("GET", "/admin/projects/{projectKey}/feedbacks/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: feedbackId },
      auth: true,
    })
  }

  /**
   * @param {string} feedbackId 反馈 id
   * @param {object} input 要改的字段
   */
  updateFeedback(feedbackId, input) {
    return this.http.request("PATCH", "/admin/projects/{projectKey}/feedbacks/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: feedbackId },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * @param {string} feedbackId 反馈 id
   */
  deleteFeedback(feedbackId) {
    return this.http.request("DELETE", "/admin/projects/{projectKey}/feedbacks/{id}", {
      pathParams: { projectKey: this.http.requireProjectKey(), id: feedbackId },
      auth: true,
    })
  }

  /** @returns 反馈总数与平均分 */
  getFeedbackStatistics() {
    return this.http.request("GET", "/admin/feedbacks/statistics", { auth: true })
  }

  // ---- 日志 ----

  /**
   * @param {{limit?: number, offset?: number, level?: number, start_time?: number, end_time?: number}} [options] 分页、等级与时间范围
   */
  listLogs(options = {}) {
    return this.http.request("GET", "/admin/projects/{projectKey}/logs", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: {
        limit: options.limit,
        offset: options.offset,
        level: options.level,
        start_time: options.start_time,
        end_time: options.end_time,
      },
      auth: true,
    })
  }

  /**
   * 后台手动补录日志。客户端上报请用 public.uploadLog。
   *
   * @param {object} input 日志字段
   */
  createLog(input) {
    return this.http.request("POST", "/admin/projects/{projectKey}/logs", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /** @returns 各等级日志条数 */
  getLogStatistics() {
    return this.http.request("GET", "/admin/logs/statistics", { auth: true })
  }

  // ---- 事件分析 ----

  /**
   * 自动发现的事件清单。定义由采集端在第一次收到某个事件名时登记，没有创建接口。
   *
   * @param {object} [options] 区间、分页与搜索
   */
  listEventDefinitions(options = {}) {
    return this.http.request("GET", "/admin/projects/{projectKey}/events/definitions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: {
        start_time: options.start_time,
        end_time: options.end_time,
        tz_offset_minutes: options.tz_offset_minutes,
        limit: options.limit,
        offset: options.offset,
        search: options.search,
        include_archived: options.include_archived,
      },
      auth: true,
    })
  }

  /**
   * @param {string} definitionId 事件定义 id
   * @param {{display_name?: string, description?: string, archived?: boolean}} input
   *   事件名不可改——它是客户端上报时使用的键。
   */
  updateEventDefinition(definitionId, input) {
    return this.http.request(
      "PATCH",
      "/admin/projects/{projectKey}/events/definitions/{definitionId}",
      {
        pathParams: { projectKey: this.http.requireProjectKey(), definitionId },
        body: compact(Object.assign({}, input)),
        auth: true,
      },
    )
  }

  /**
   * 删除事件定义本身；明细与统计保留，下一次上报会把定义重新建回来。
   *
   * @param {string} definitionId 事件定义 id
   */
  deleteEventDefinition(definitionId) {
    return this.http.request(
      "DELETE",
      "/admin/projects/{projectKey}/events/definitions/{definitionId}",
      {
        pathParams: { projectKey: this.http.requireProjectKey(), definitionId },
        auth: true,
      },
    )
  }

  /**
   * @param {object} [options] 统计区间
   */
  getEventOverview(options = {}) {
    return this.http.request("GET", "/admin/projects/{projectKey}/events/stats/overview", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: Object.assign({}, options),
      auth: true,
    })
  }

  /**
   * 事件量趋势。data 是总量，永远返回；给了 group_by 时额外返回拆开的 series。
   *
   * @param {object} [options] 区间、粒度与拆分维度
   */
  getEventTimeseries(options = {}) {
    return this.http.request("GET", "/admin/projects/{projectKey}/events/stats/timeseries", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: Object.assign({}, options),
      auth: true,
    })
  }

  /**
   * 事件分布。total 是全量而非本页之和。
   *
   * @param {object} [options] dimension 为 "property" 时必须给 property_key
   */
  getEventBreakdown(options = {}) {
    return this.http.request("GET", "/admin/projects/{projectKey}/events/stats/breakdown", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: Object.assign({}, options),
      auth: true,
    })
  }

  /**
   * 星期 × 小时活跃热力图，固定 168 格。按每条上报来源国家的时区折叠。
   *
   * @param {object} [options] 区间与可选的单事件筛选
   */
  getEventHeatmap(options = {}) {
    return this.http.request("GET", "/admin/projects/{projectKey}/events/stats/heatmap", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: Object.assign({}, options),
      auth: true,
    })
  }

  /**
   * 漏斗转化。只读接口，所需 scope 是 events:read。
   *
   * @param {{steps: Array<object>, window_seconds?: number}} options 步骤数组（2 到 8 步）
   */
  getFunnel(options) {
    return this.http.request("POST", "/admin/projects/{projectKey}/events/analysis/funnel", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, options)),
      auth: true,
    })
  }

  /**
   * 留存矩阵。尚未走完的周期返回 null 而不是 0。
   *
   * @param {{start_event: string, return_event?: string}} options 起始与回访事件
   */
  getRetention(options) {
    return this.http.request("POST", "/admin/projects/{projectKey}/events/analysis/retention", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, options)),
      auth: true,
    })
  }

  /**
   * 路径分析（桑基图边集）。默认按会话串联。
   *
   * @param {object} [options] 起点、深度与分支数
   */
  getPaths(options = {}) {
    return this.http.request("POST", "/admin/projects/{projectKey}/events/analysis/paths", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, options)),
      auth: true,
    })
  }

  /**
   * 指标 DSL 求值。查询构建器与看板卡片共用这一个入口。
   *
   * @param {object} query 指标定义；formula 支持 "A / B * 100" 形式的跨事件运算
   */
  runEventQuery(query) {
    return this.http.request("POST", "/admin/projects/{projectKey}/events/analysis/query", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, query)),
      auth: true,
    })
  }

  /**
   * @returns 该项目保存的分析卡片，按 sort_order 升序
   */
  listDashboardCards() {
    return this.http.request("GET", "/admin/projects/{projectKey}/events/dashboards/cards", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * @param {{title: string, query: object}} input 查询定义在写入时就完整校验
   */
  createDashboardCard(input) {
    return this.http.request("POST", "/admin/projects/{projectKey}/events/dashboards/cards", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * @param {string} cardId 卡片 id
   * @param {object} input 要改的字段
   */
  updateDashboardCard(cardId, input) {
    return this.http.request(
      "PATCH",
      "/admin/projects/{projectKey}/events/dashboards/cards/{cardId}",
      {
        pathParams: { projectKey: this.http.requireProjectKey(), cardId },
        body: compact(Object.assign({}, input)),
        auth: true,
      },
    )
  }

  /**
   * @param {string} cardId 卡片 id
   */
  deleteDashboardCard(cardId) {
    return this.http.request(
      "DELETE",
      "/admin/projects/{projectKey}/events/dashboards/cards/{cardId}",
      {
        pathParams: { projectKey: this.http.requireProjectKey(), cardId },
        auth: true,
      },
    )
  }

  /**
   * 代最终用户删除其全部事件明细（GDPR Art.17）。小时汇总不在删除范围内。
   *
   * @param {string} distinctId 要删除的匿名标识
   */
  deleteEventSubject(distinctId) {
    return this.http.request(
      "DELETE",
      "/admin/projects/{projectKey}/events/subjects/{distinctId}",
      {
        pathParams: { projectKey: this.http.requireProjectKey(), distinctId },
        auth: true,
      },
    )
  }

  // ---- GitHub Webhook ----

  /**
   * @returns 绑定项目的 webhook 配置；secret 不回显，只给末 6 位提示
   */
  getGithubWebhook() {
    return this.http.request("GET", "/admin/projects/{projectKey}/github-webhook", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * @param {string} secret GitHub Webhook 表单里填的 secret 原文，16..256 字符
   * @returns 含完整 secret 的配置，仅此一次返回
   */
  setGithubWebhookSecret(secret) {
    return this.http.request("PUT", "/admin/projects/{projectKey}/github-webhook", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: { secret },
      auth: true,
    })
  }

  /**
   * @returns 含新 secret 的配置；旧 secret 立即失效，记得同步改 GitHub
   */
  regenerateGithubWebhookSecret() {
    return this.http.request("POST", "/admin/projects/{projectKey}/github-webhook/regenerate", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * @returns 清除后的配置；接收端点随即拒绝所有推送
   */
  clearGithubWebhookSecret() {
    return this.http.request("DELETE", "/admin/projects/{projectKey}/github-webhook", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  // ---- GitHub App ----

  /**
   * 实例级 GitHub App 配置。仅管理员 JWT 可访问，API key 会得到 401。
   * 私钥永不回读，只返回指纹。
   */
  getGithubAppConfig() {
    return this.http.request("GET", "/admin/github-app", { auth: true })
  }

  /**
   * 部分更新实例级 GitHub App 配置。private_key / webhook_secret 传空串表示清除。
   *
   * @param {{app_id?: string, private_key?: string, webhook_secret?: string, enabled_features?: string[], feedback_issue_custom_template?: boolean, feedback_issue_title_template?: string, feedback_issue_body_template?: string}} input 要改的字段
   */
  updateGithubAppConfig(input) {
    return this.http.request("PUT", "/admin/github-app", {
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /** 清空实例级 GitHub App 配置。所有项目的 GitHub App 功能随即失效。 */
  clearGithubAppConfig() {
    return this.http.request("DELETE", "/admin/github-app", { auth: true })
  }

  /** 查绑定项目的 GitHub 集成配置。 */
  getGithubIntegration() {
    return this.http.request("GET", "/admin/projects/{projectKey}/github-integration", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * 部分更新绑定项目的 GitHub 集成配置。打开功能开关要求实例级已启用对应功能。
   *
   * @param {{repo_full_name?: string, feedback_issue_enabled?: boolean, feedback_issue_template_source?: "inherit"|"custom"|"repo", feedback_issue_template_repo_path?: string, feedback_issue_template_repo_ref?: string, feedback_issue_title_template?: string, feedback_issue_body_template?: string, feedback_issue_labels?: string[], comment_commands_enabled?: boolean, command_allowed_associations?: string[], command_allowed_users?: string[], commands?: Array<{name: string, workflow: string, ref: string, input?: string}>}} input 要改的字段
   */
  updateGithubIntegration(input) {
    return this.http.request("PUT", "/admin/projects/{projectKey}/github-integration", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * 预览目标仓库里的反馈 Issue 模板（模板来源为 repo 时使用）。
   * 拉取失败不抛异常，原因放在返回值的 error 字段里。
   *
   * @param {{refresh?: boolean}} [options] refresh 为 true 时先作废服务端缓存再重新拉取
   */
  getGithubIntegrationRepoTemplate(options = {}) {
    return this.http.request(
      "GET",
      "/admin/projects/{projectKey}/github-integration/repo-template",
      {
        pathParams: { projectKey: this.http.requireProjectKey() },
        query: { refresh: options.refresh ? "true" : undefined },
        auth: true,
      },
    )
  }

  // ---- 条款文档 ----

  /**
   * 列出全部条款文档的设置视图（含生效正文、自定义草稿与内置原文）。
   *
   * 条款接口只接受管理员 JWT，API Key 会得到 401。不作用于绑定项目。
   */
  listTermsDocuments() {
    return this.http.request("GET", "/admin/terms/documents", { auth: true })
  }

  /**
   * @param {"privacy-policy" | "sdk-compliance"} slug 文档标识
   * @returns 单份条款文档的设置视图
   */
  getTermsDocument(slug) {
    return this.http.request("GET", "/admin/terms/documents/{slug}", {
      pathParams: { slug },
      auth: true,
    })
  }

  /**
   * 部分更新条款文档，只修改传入的字段。
   *
   * custom 关闭时 content 仍会保存为草稿，重新打开即可继续编辑；content 传空串
   * 表示清除草稿。
   *
   * @param {"privacy-policy" | "sdk-compliance"} slug 文档标识
   * @param {{custom?: boolean, content?: string}} input 自定义开关与正文
   */
  updateTermsDocument(slug, input) {
    return this.http.request("PUT", "/admin/terms/documents/{slug}", {
      pathParams: { slug },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * 恢复内置条款正文：关闭自定义开关并丢弃草稿，前台随即回到内置正文。
   *
   * @param {"privacy-policy" | "sdk-compliance"} slug 文档标识
   */
  resetTermsDocument(slug) {
    return this.http.request("DELETE", "/admin/terms/documents/{slug}", {
      pathParams: { slug },
      auth: true,
    })
  }

  // ---- AI 翻译 ----

  /**
   * 实例级 AI 翻译配置。仅管理员 JWT 可访问，API key 会得到 401 ——
   * 这是一份能直接产生上游账单的出站凭据。API Key 永不回读，只返回指纹。
   */
  getTranslationConfig() {
    return this.http.request("GET", "/admin/translation", { auth: true })
  }

  /**
   * 部分更新实例级 AI 翻译配置。api_key 传空串表示清除。
   *
   * base_url 只填路径前缀（如 https://api.openai.com/v1），后缀按 provider 固定拼接。
   *
   * @param {{enabled?: boolean, provider?: "openai"|"anthropic", base_url?: string, api_key?: string, model?: string, custom_prompt?: boolean, system_prompt?: string}} input 要改的字段
   */
  updateTranslationConfig(input) {
    return this.http.request("PUT", "/admin/translation", {
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /** 清空实例级 AI 翻译配置，总闸一并关闭。 */
  clearTranslationConfig() {
    return this.http.request("DELETE", "/admin/translation", { auth: true })
  }

  /**
   * 用当前配置译一句样例，验证地址、凭据与模型是否配得通。
   * 上游失败不抛异常，原因在结果的 error 里。
   */
  testTranslation() {
    return this.http.request("POST", "/admin/translation/test", { auth: true })
  }

  /**
   * 把绑定项目下一条内容的若干字段译成目标语言，一次往返翻完整条。
   *
   * 结果只返回不入库：调用方拿它填草稿，由人确认后再走各自的保存接口。
   *
   * @param {{kind: "announcement"|"project", target_locale: string, source_locale?: string, fields: Record<string, string>}} input 内容类型、目标语言与待译字段
   */
  translate(input) {
    return this.http.request("POST", "/admin/projects/{projectKey}/translate", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }
}

/**
 * Verhub SDK 入口。
 *
 * 配置里传入 projectKey 后，项目作用域的方法都用它，不必再逐次传项目参数。
 * 两个命名空间共用一份连接、凭据与来源声明：client.public 不需要凭据，
 * client.admin 需要管理员 JWT 或 API Key。
 */
class VerhubClient {
  /**
   * @param {{
   *   baseUrl: string,
   *   projectKey?: string,
   *   token?: string,
   *   platform?: string | null,
   *   platformVersion?: string | null,
   *   timeoutMs?: number,
   *   retries?: number,
   *   fetch?: typeof fetch,
   *   headers?: Record<string, string>,
   *   appIdentifier?: string,
   *   logger?: (event: {method: string, url: string, status?: number, attempt: number}) => void,
   *   analytics?: object,
   * }} options 客户端配置；baseUrl 须包含 /api/v1 前缀。
   *   analytics 是事件采集配置，省略即启用默认行为（设备级匿名标识 + 本地待发
   *   队列）；面向欧盟用户的接入方应当设置 analytics.requireConsent 为 true。
   */
  constructor(options) {
    this.http = new HttpClient(options)
    this.public = new PublicApi(this.http, options.analytics)
    this.admin = new AdminApi(this.http)
  }

  /**
   * @param {object} options 客户端配置
   * @returns {VerhubClient}
   */
  static create(options) {
    return new VerhubClient(options)
  }

  /** 当前绑定的项目标识。 */
  get projectKey() {
    return this.http.projectKey
  }

  /**
   * @param {string} projectKey 新的绑定项目标识
   */
  setProjectKey(projectKey) {
    this.http.setProjectKey(projectKey)
  }

  /**
   * @param {string} token 管理员 JWT 或 API Key
   */
  setToken(token) {
    this.http.setToken(token)
  }

  /** 清除当前凭据，之后调用 admin 接口会抛 VerhubAuthError。 */
  clearToken() {
    this.http.clearToken()
  }

  /**
   * @param {string | null} platform 平台声明；传 null 则不再声明平台
   */
  setPlatform(platform) {
    this.http.setPlatform(platform)
  }

  /**
   * @param {string | null} platformVersion 系统版本明细；传 null 则不再声明
   */
  setPlatformVersion(platformVersion) {
    this.http.setPlatformVersion(platformVersion)
  }

  /** @returns 服务健康状态 */
  health() {
    return this.http.request("GET", "/health")
  }
}

VerhubClient.version = VERHUB_SDK_VERSION

/** VerhubClient 的别名。 */
const VerhubSDK = VerhubClient

    root.VerhubClient = VerhubClient
    root.VerhubSDK = VerhubSDK
    root.PublicApi = PublicApi
    root.AdminApi = AdminApi
    root.EventQueue = EventQueue
    root.VerhubError = VerhubError
    root.VerhubApiError = VerhubApiError
    root.VerhubAuthError = VerhubAuthError
    root.VerhubConnectionError = VerhubConnectionError
    root.detectPlatform = detectPlatform
    root.detectPlatformVersion = detectPlatformVersion
    root.detectDoNotTrack = detectDoNotTrack
    root.analyticsNamespace = analyticsNamespace
    root.fnv1a32Hex = fnv1a32Hex
    root.originOf = originOf
    root.memoryStorage = memoryStorage
    root.nullStorage = nullStorage
    root.randomId = randomId
    root.sanitizePlatformVersion = sanitizePlatformVersion
    root.compact = compact
    root.PLATFORM_HEADER = PLATFORM_HEADER
    root.PLATFORM_VERSION_HEADER = PLATFORM_VERSION_HEADER
    root.VERHUB_SDK_VERSION = VERHUB_SDK_VERSION
})
