import { VerhubApiError, VerhubConnectionError, VerhubError } from "./errors"
import type { Platform } from "./models"
import { VERHUB_SDK_VERSION } from "./version"

/** 客户端平台声明头。仅用于服务端请求统计，不影响接口返回内容。 */
export const PLATFORM_HEADER = "x-verhub-platform"

/** 客户端系统版本明细头，如 `11` / `ubuntu 24.04`；超过 32 字符会被服务端丢弃。 */
export const PLATFORM_VERSION_HEADER = "x-verhub-platform-version"

/** 系统版本明细的长度上限，与服务端一致，超出直接截断。 */
const MAX_PLATFORM_VERSION_LENGTH = 32

export type QueryValue = string | number | boolean | null | undefined
export type RequestQuery = Record<string, QueryValue>

export type VerhubClientOptions = {
  /** API 根地址，须包含 `/api/v1` 前缀。 */
  baseUrl: string
  /** 绑定的项目标识；项目作用域的方法默认用它。 */
  projectKey?: string
  /** 管理员 JWT 或 API Key；只调 public 接口时不用给。 */
  token?: string
  /** 平台声明；省略则按运行环境自动探测，传 null 则不声明。 */
  platform?: Platform | null
  /** 系统版本明细；省略时若平台也是自动探测则一并自动提取，传 null 则不声明。 */
  platformVersion?: string | null
  /** 单次请求超时（毫秒），默认 15000；传 0 表示不超时。 */
  timeoutMs?: number
  /** 自定义 fetch 实现，可用于注入代理、埋点或测试桩。 */
  fetch?: typeof globalThis.fetch
  /** 附加到每个请求上的头。 */
  headers?: Record<string, string>
}

type NodeLikeProcess = {
  versions?: { node?: string }
  platform?: string
  getBuiltinModule?: (id: string) => unknown
}
type DenoGlobal = { build?: { os?: string } }

/** 宿主系统名 → 契约平台值。认不出的一律 `others`，不瞎猜。 */
const OS_TO_PLATFORM: Record<string, Platform> = {
  win32: "windows",
  windows: "windows",
  darwin: "macos",
  linux: "linux",
  android: "android",
}

/** 老 Windows 的 NT 内核号 → 市场版本号。Win10/11 都是 10.0，另按构建号区分。 */
const WINDOWS_NT_TO_MARKET: Record<string, string> = {
  "6.1": "7",
  "6.2": "8",
  "6.3": "8.1",
}

/** Darwin 内核大版本 → macOS 市场版本号。 */
const DARWIN_TO_MACOS: Record<string, string> = {
  "25": "26",
  "24": "15",
  "23": "14",
  "22": "13",
  "21": "12",
  "20": "11",
  "19": "10.15",
  "18": "10.14",
  "17": "10.13",
  "16": "10.12",
}

/** 运行在服务端 JS 运行时（Node / Bun / Deno）时返回宿主系统名。 */
function hostOsName(): string | undefined {
  const proc = (globalThis as { process?: NodeLikeProcess }).process
  if (proc?.versions?.node && proc.platform) {
    return proc.platform
  }

  return (globalThis as { Deno?: DenoGlobal }).Deno?.build?.os
}

/**
 * 同步取 Node 内建模块，不用 import 以免污染浏览器打包。
 *
 * `process.getBuiltinModule`（Node 20.16+/22+）在 CJS 与 ESM 下都能用；老 Node
 * 退回到全局 `require`（仅 CJS 有）。浏览器里两者都没有，返回 undefined。
 */
function loadNodeBuiltin(name: string): unknown {
  const proc = (globalThis as { process?: NodeLikeProcess }).process
  try {
    if (typeof proc?.getBuiltinModule === "function") {
      return proc.getBuiltinModule(name)
    }
  } catch {
    /* 忽略：拿不到就当没有 */
  }
  try {
    const req = (globalThis as { require?: (id: string) => unknown }).require
    if (typeof req === "function") {
      return req(name)
    }
  } catch {
    /* 忽略 */
  }
  return undefined
}

/**
 * 猜测当前运行平台，用于填充 {@link PLATFORM_HEADER}。
 *
 * 浏览器与 Worker 一律记作 `web`——那里真正有意义的维度是浏览器而不是宿主
 * 系统，而 `navigator` 是两者都有、Node 里又已经被上一步排除掉的判据。
 */
export function detectPlatform(): Platform {
  const os = hostOsName()
  if (os === undefined) {
    return typeof navigator === "undefined" ? "others" : "web"
  }

  return OS_TO_PLATFORM[os] ?? "others"
}

/** 读 /etc/os-release，拼成 `发行版 版本号`（如 `ubuntu 24.04`）。 */
function linuxDistroVersion(): string {
  const fs = loadNodeBuiltin("node:fs") as { readFileSync?: (p: string, e: string) => string }
  if (typeof fs?.readFileSync !== "function") {
    return ""
  }
  try {
    const text = fs.readFileSync("/etc/os-release", "utf8")
    const unquote = (value: string | undefined) => (value ?? "").trim().replace(/^["']|["']$/g, "")
    const id = unquote(/^ID=(.*)$/m.exec(text)?.[1]).toLowerCase()
    const version = unquote(/^VERSION_ID=(.*)$/m.exec(text)?.[1])
    return `${id} ${version}`.trim().slice(0, MAX_PLATFORM_VERSION_LENGTH)
  } catch {
    return ""
  }
}

/**
 * 从系统信息里提取系统版本明细，用于填充 {@link PLATFORM_VERSION_HEADER}。
 *
 * Windows 按内核构建号还原市场版本号，macOS 由 Darwin 大版本映射，Linux 读
 * os-release。浏览器与取不到内建模块时返回空串，交给服务端从 User-Agent 兜底。
 */
export function detectPlatformVersion(): string {
  const os = hostOsName()
  if (os === undefined) {
    return ""
  }

  const nodeOs = loadNodeBuiltin("node:os") as { release?: () => string }
  if (typeof nodeOs?.release !== "function") {
    return ""
  }

  try {
    const release = String(nodeOs.release() || "")
    if (os === "win32" || os === "windows") {
      const win10 = /^10\.0\.(\d+)/.exec(release)
      if (win10) {
        return Number(win10[1]) >= 22000 ? "11" : "10"
      }
      const nt = /^(\d+\.\d+)/.exec(release)?.[1]
      return (nt && WINDOWS_NT_TO_MARKET[nt]) || ""
    }
    if (os === "darwin") {
      const major = /^(\d+)/.exec(release)?.[1]
      return (major && DARWIN_TO_MACOS[major]) || ""
    }
    if (os === "linux" || os === "android") {
      return linuxDistroVersion()
    }
  } catch {
    /* 版本探测纯属锦上添花，任何异常都不该阻断请求 */
  }

  return ""
}

/**
 * 丢掉值为 `undefined` 的字段，保留显式的 `null`。
 *
 * `null` 会被序列化成 JSON null，是「把这个字段置空」的意思；只有完全没提供
 * 的字段才该从请求里消失。
 *
 * @param input 原始字段表
 */
export function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      out[key] = value
    }
  }
  return out as Partial<T>
}

export type RequestOptions = {
  pathParams?: Record<string, string>
  query?: RequestQuery
  body?: unknown
  auth?: boolean
}

/** 底层 HTTP 客户端，两个命名空间共用一份连接、凭据与来源声明。 */
export class HttpClient {
  private baseUrl: string
  private projectKey?: string
  private token: string
  private platform: Platform | null
  private platformVersion: string | null
  private readonly timeoutMs: number
  private readonly fetcher: typeof globalThis.fetch
  private readonly extraHeaders: Record<string, string>

  /**
   * @param options 客户端配置
   */
  constructor(options: VerhubClientOptions) {
    this.baseUrl = options.baseUrl.trim().replace(/\/+$/, "")
    this.projectKey = options.projectKey
    this.token = options.token ?? ""
    this.timeoutMs = options.timeoutMs ?? 15000
    this.extraHeaders = options.headers ?? {}

    const autoPlatform = options.platform === undefined
    // 内联三元让 TS 能收窄掉 undefined；用 autoPlatform 变量则窄不了。
    this.platform = options.platform === undefined ? detectPlatform() : options.platform

    if (options.platformVersion === undefined) {
      // 平台是自己探测出来的，才顺带把版本也探测了——用户指定了平台却由我们
      // 猜版本，很容易出现「平台 linux、版本却是 windows 11」的错配。
      this.platformVersion = autoPlatform && this.platform ? detectPlatformVersion() || null : null
    } else {
      this.platformVersion = options.platformVersion
    }

    const fetcher = options.fetch ?? globalThis.fetch
    if (typeof fetcher !== "function") {
      throw new TypeError("当前环境没有全局 fetch，请通过 options.fetch 传入实现")
    }
    // 解绑到 globalThis：某些实现（含 undici）要求 fetch 以全局对象为 this。
    this.fetcher = fetcher.bind(globalThis)
  }

  /**
   * @param token 管理员 JWT 或 API Key
   */
  setToken(token: string): void {
    this.token = token
  }

  /** 清除当前凭据，之后调用 admin 接口会直接抛错。 */
  clearToken(): void {
    this.token = ""
  }

  /**
   * @param projectKey 新的绑定项目标识
   */
  setProjectKey(projectKey: string): void {
    this.projectKey = projectKey
  }

  /**
   * @param platform 平台声明；传 null 则不再声明平台
   */
  setPlatform(platform: Platform | null): void {
    this.platform = platform
  }

  /**
   * @param platformVersion 系统版本明细；传 null 则不再声明
   */
  setPlatformVersion(platformVersion: string | null): void {
    this.platformVersion = platformVersion
  }

  /** 当前绑定的项目标识。 */
  getProjectKey(): string | undefined {
    return this.projectKey
  }

  /**
   * @returns 绑定的项目标识
   * @throws VerhubError 未绑定 projectKey
   */
  requireProjectKey(): string {
    if (!this.projectKey) {
      throw new VerhubError("未设置 projectKey：请在创建客户端时传入，或调用 setProjectKey()")
    }
    return this.projectKey
  }

  /**
   * @param method HTTP 方法
   * @param pathTemplate 形如 `/public/{projectKey}` 的路径模板
   * @param options 路径参数、查询参数、请求体与鉴权开关
   */
  async request<T>(method: string, pathTemplate: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(this.resolvePath(pathTemplate, options.pathParams), options.query)

    const headers: Record<string, string> = {
      Accept: "application/json",
      // 浏览器禁止脚本改写 User-Agent，设了也会被静默丢弃，所以只在服务端运行时带上。
      ...(hostOsName() ? { "User-Agent": `verhub-sdk-js/${VERHUB_SDK_VERSION}` } : {}),
      ...this.extraHeaders,
    }
    if (this.platform) {
      headers[PLATFORM_HEADER] = this.platform
    }
    if (this.platformVersion) {
      headers[PLATFORM_VERSION_HEADER] = this.platformVersion
    }

    if (options.auth) {
      if (!this.token) {
        throw new VerhubApiError("缺少凭据：请先设置 token", 401, null)
      }
      headers.Authorization = `Bearer ${this.token}`
    }

    let payload: string | undefined
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json"
      payload = JSON.stringify(options.body)
    }

    const controller = this.timeoutMs > 0 ? new AbortController() : undefined
    const timer =
      controller && this.timeoutMs > 0
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : undefined

    let response: Response
    try {
      response = await this.fetcher(url, {
        method,
        headers,
        body: payload,
        signal: controller?.signal,
      })
    } catch (cause) {
      const reason = controller?.signal.aborted ? `超时（${this.timeoutMs}ms）` : String(cause)
      throw new VerhubConnectionError(`请求 ${method} ${url} 失败：${reason}`, cause)
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
    }

    const raw = await response.text()
    const parsed = this.parseJson(raw)

    if (!response.ok) {
      const message = this.errorMessage(parsed) ?? `请求失败，HTTP ${response.status}`
      throw new VerhubApiError(message, response.status, parsed)
    }

    return parsed as T
  }

  /**
   * @param template 路径模板
   * @param params 路径参数
   */
  private resolvePath(template: string, params?: Record<string, string>): string {
    return template.replace(/\{([^}]+)\}/g, (_match, key: string) => {
      const value = params?.[key]
      if (value === undefined || value === "") {
        throw new TypeError(`缺少路径参数：${key}`)
      }
      return encodeURIComponent(value)
    })
  }

  /**
   * @param path 已填充的路径
   * @param query 查询参数
   */
  private buildUrl(path: string, query?: RequestQuery): string {
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
   * @param raw 原始响应文本
   */
  private parseJson(raw: string): unknown {
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
   * @param body 已解析的响应体；NestJS 校验失败时 message 是字符串数组
   */
  private errorMessage(body: unknown): string | null {
    if (!body || typeof body !== "object") {
      return null
    }

    const message = (body as { message?: unknown }).message
    if (typeof message === "string") {
      return message
    }
    if (Array.isArray(message) && message.length > 0) {
      return message.map((item) => String(item)).join("; ")
    }

    return null
  }
}

export { VERHUB_SDK_VERSION }
