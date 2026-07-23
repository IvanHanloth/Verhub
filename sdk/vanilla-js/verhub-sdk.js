/**
 * Verhub 纯 JS SDK（ES module）。
 *
 * 接口面与 Python / TypeScript / Rust 版一一对应。零依赖、零构建，直接 import
 * 或用 <script> 引 verhub-sdk.global.js。契约以仓库根目录的
 * verhub.openapi.yaml 为准。
 *
 * 本文件是 verhub-sdk.global.js 的生成源，`node build.mjs` 会把文件末尾那条
 * export 语句换成全局赋值——所以整份文件里只允许出现那一处 export。
 */

const VERHUB_SDK_VERSION = "0.2.3"

/** 客户端平台声明头。仅用于服务端请求统计，不影响接口返回内容。 */
const PLATFORM_HEADER = "x-verhub-platform"

/** 客户端系统版本明细头，如 `11` / `ubuntu 24.04`；超过 32 字符会被服务端丢弃。 */
const PLATFORM_VERSION_HEADER = "x-verhub-platform-version"

/** 系统版本明细的长度上限，与服务端一致，超出直接截断。 */
const MAX_PLATFORM_VERSION_LENGTH = 32

/**
 * 所有 SDK 异常的基类，便于调用方一次性捕获。
 */
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
 * 服务端返回了非 2xx 响应。
 */
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

/**
 * 请求没能到达服务端（超时、DNS、连接被拒等）。
 */
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

/** 宿主系统名 → 契约平台值。认不出的一律 others，不瞎猜。 */
const OS_TO_PLATFORM = {
  win32: "windows",
  windows: "windows",
  darwin: "macos",
  linux: "linux",
  android: "android",
}

/** 老 Windows 的 NT 内核号 → 市场版本号。Win10/11 都是 10.0，另按构建号区分。 */
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
 * @returns {string | undefined}
 */
function hostOsName() {
  const proc = globalThis.process
  if (proc && proc.versions && proc.versions.node && proc.platform) {
    return proc.platform
  }

  return globalThis.Deno && globalThis.Deno.build ? globalThis.Deno.build.os : undefined
}

/**
 * 同步取 Node 内建模块，不用 import 以免污染浏览器打包。
 *
 * process.getBuiltinModule（Node 20.16+/22+）在 CJS 与 ESM 下都能用；老 Node
 * 退回到全局 require（仅 CJS 有）。浏览器里两者都没有，返回 undefined。
 *
 * @param {string} name 模块名
 * @returns {any}
 */
function loadNodeBuiltin(name) {
  const proc = globalThis.process
  try {
    if (proc && typeof proc.getBuiltinModule === "function") {
      return proc.getBuiltinModule(name)
    }
  } catch {
    /* 忽略 */
  }
  try {
    if (typeof globalThis.require === "function") {
      return globalThis.require(name)
    }
  } catch {
    /* 忽略 */
  }
  return undefined
}

/**
 * 猜测当前运行平台，用于填充 PLATFORM_HEADER。
 *
 * 浏览器与 Worker 一律记作 web——那里真正有意义的维度是浏览器而不是宿主系统，
 * 而 navigator 是两者都有、Node 里又已经被上一步排除掉的判据。
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
    return `${id} ${version}`.trim().slice(0, MAX_PLATFORM_VERSION_LENGTH)
  } catch {
    return ""
  }
}

/**
 * 从系统信息里提取系统版本明细，用于填充 PLATFORM_VERSION_HEADER。
 *
 * Windows 按内核构建号还原市场版本号，macOS 由 Darwin 大版本映射，Linux 读
 * os-release。浏览器与取不到内建模块时返回空串，交给服务端从 User-Agent 兜底。
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
    /* 版本探测纯属锦上添花，任何异常都不该阻断请求 */
  }

  return ""
}

/**
 * 丢掉值为 undefined 的字段，保留显式的 null。
 *
 * null 会被序列化成 JSON null，是「把这个字段置空」的意思；只有完全没提供的
 * 字段才该从请求里消失。
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
   *   fetch?: typeof fetch,
   *   headers?: Record<string, string>,
   * }} options 客户端配置
   */
  constructor(options) {
    this.baseUrl = String(options.baseUrl || "")
      .trim()
      .replace(/\/+$/, "")
    this.projectKey = options.projectKey
    this.token = options.token || ""
    this.timeoutMs = options.timeoutMs === undefined ? 15000 : options.timeoutMs
    this.extraHeaders = options.headers || {}

    const autoPlatform = options.platform === undefined
    this.platform = autoPlatform ? detectPlatform() : options.platform

    if (options.platformVersion === undefined) {
      // 平台是自己探测出来的，才顺带把版本也探测了——用户指定了平台却由我们
      // 猜版本，很容易出现「平台 linux、版本却是 windows 11」的错配。
      this.platformVersion = autoPlatform && this.platform ? detectPlatformVersion() || null : null
    } else {
      this.platformVersion = options.platformVersion
    }

    const fetcher = options.fetch || globalThis.fetch
    if (typeof fetcher !== "function") {
      throw new TypeError("当前环境没有全局 fetch，请通过 options.fetch 传入实现")
    }
    // 解绑到 globalThis：某些实现要求 fetch 以全局对象为 this。
    this.fetcher = fetcher.bind(globalThis)
  }

  /**
   * @param {string} token 管理员 JWT 或 API Key
   */
  setToken(token) {
    this.token = token
  }

  /** 清除当前凭据，之后调用 admin 接口会直接抛错。 */
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
    this.platform = platform
  }

  /**
   * @param {string | null} platformVersion 系统版本明细；传 null 则不再声明
   */
  setPlatformVersion(platformVersion) {
    this.platformVersion = platformVersion
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
   * @param {string} method HTTP 方法
   * @param {string} pathTemplate 形如 `/public/{projectKey}` 的路径模板
   * @param {{pathParams?: Record<string, string>, query?: Record<string, unknown>, body?: unknown, auth?: boolean}} [options] 请求参数
   * @returns {Promise<unknown>}
   */
  async request(method, pathTemplate, options = {}) {
    const url = this.buildUrl(this.resolvePath(pathTemplate, options.pathParams), options.query)

    const headers = Object.assign(
      { Accept: "application/json" },
      // 浏览器禁止脚本改写 User-Agent，设了也会被静默丢弃，所以只在服务端运行时带上。
      hostOsName() ? { "User-Agent": `verhub-sdk-js/${VERHUB_SDK_VERSION}` } : {},
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
        throw new VerhubApiError("缺少凭据：请先设置 token", 401, null)
      }
      headers.Authorization = `Bearer ${this.token}`
    }

    let body
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(options.body)
    }

    const controller = this.timeoutMs > 0 ? new AbortController() : undefined
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined

    let response
    try {
      response = await this.fetcher(url, {
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

    const raw = await response.text()
    const payload = this.parseJson(raw)

    if (!response.ok) {
      const message = this.errorMessage(payload) || `请求失败，HTTP ${response.status}`
      throw new VerhubApiError(message, response.status, payload)
    }

    return payload
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
   * @param {Record<string, unknown>} [query] 查询参数
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
   * @returns {unknown}
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

/**
 * 公开接口，不需要凭据。
 *
 * 这些是客户端 App 会直接调用的那一组：查版本、查公告、报日志和行为。全部作用于
 * 客户端绑定的项目（构造时传入的 projectKey），因此方法不再逐次收项目参数。
 */
class PublicApi {
  /**
   * @param {HttpClient} http 底层 HTTP 客户端
   */
  constructor(http) {
    this.http = http
  }

  getProject() {
    return this.http.request("GET", "/public/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
    })
  }

  /**
   * @param {{limit?: number, offset?: number}} [options] 分页参数
   */
  listVersions(options = {}) {
    return this.http.request("GET", "/public/{projectKey}/versions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset },
    })
  }

  getLatestVersion() {
    return this.http.request("GET", "/public/{projectKey}/versions/latest", {
      pathParams: { projectKey: this.http.requireProjectKey() },
    })
  }

  /**
   * @returns 最新 preview 版本；没有则为 null
   */
  getLatestPreviewVersion() {
    return this.http.request("GET", "/public/{projectKey}/versions/latest-preview", {
      pathParams: { projectKey: this.http.requireProjectKey() },
    })
  }

  /**
   * @param {string} version 版本号，如 `1.2.0`
   */
  getVersion(version) {
    return this.http.request("GET", "/public/{projectKey}/versions/by-version/{version}", {
      pathParams: { projectKey: this.http.requireProjectKey(), version },
    })
  }

  /**
   * 提交当前版本并检查更新。
   *
   * current_version 与 current_comparable_version 至少提供一个。只给
   * current_version 时服务端按版本号查库取其登记的可比较版本号，该版本未登记
   * 会返回 400；两者都给时以 current_comparable_version 为准。
   *
   * @param {{current_version?: string, current_comparable_version?: string, include_preview?: boolean}} options 当前版本与比较选项
   */
  checkUpdate(options) {
    return this.http.request("POST", "/public/{projectKey}/versions/check-update", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, options)),
    })
  }

  /**
   * @param {{limit?: number, offset?: number, platform?: string}} [options] 分页与平台筛选
   */
  listAnnouncements(options = {}) {
    return this.http.request("GET", "/public/{projectKey}/announcements", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset, platform: options.platform },
    })
  }

  /**
   * @param {{platform?: string}} [options] 平台筛选
   */
  getLatestAnnouncement(options = {}) {
    return this.http.request("GET", "/public/{projectKey}/announcements/latest", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { platform: options.platform },
    })
  }

  /**
   * @param {{content: string, user_id?: string, rating?: number, platform?: string, platform_version?: string, custom_data?: object}} input 反馈字段
   */
  createFeedback(input) {
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

  /**
   * @param {{action_id: string, custom_data?: object}} input 行为记录字段
   */
  createActionRecord(input) {
    return this.http.request("POST", "/public/{projectKey}/actions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact(Object.assign({}, input)),
    })
  }
}

/**
 * 管理接口，全部需要凭据。
 *
 * 凭据可以是 `POST /auth/login` 拿到的管理员 JWT（默认 2 小时过期），也可以是
 * 后台签发的长期 API Key（vh_ 前缀）。别把管理凭据打进浏览器产物——网页里请
 * 只用 public 命名空间。
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

  getProject() {
    return this.http.request("GET", "/admin/projects/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      auth: true,
    })
  }

  /**
   * 更新绑定的项目。提交 project_key 会改键，改完记得 setProjectKey。
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

  deleteProject() {
    return this.http.request("DELETE", "/admin/projects/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
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
   * @param {object} input 版本字段，version 与 comparable_version 必填
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
   * @param {{title: string, content: string, is_pinned?: boolean, is_hidden?: boolean, platforms?: string[], author?: string, published_at?: number}} input 公告字段
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
   * @param {{limit?: number, offset?: number}} [options] 分页参数
   */
  listFeedbacks(options = {}) {
    return this.http.request("GET", "/admin/projects/{projectKey}/feedbacks", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset },
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

  // ---- 行为 ----

  /**
   * @param {{limit?: number, offset?: number}} [options] 分页参数
   */
  listActions(options = {}) {
    return this.http.request("GET", "/admin/projects/{projectKey}/actions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset },
      auth: true,
    })
  }

  /**
   * 在绑定项目下创建行为定义。
   *
   * @param {{name: string, description: string, custom_data?: object}} input 行为定义字段
   */
  createAction(input) {
    return this.http.request("POST", "/admin/projects/actions", {
      body: compact(Object.assign({}, input, { project_key: this.http.requireProjectKey() })),
      auth: true,
    })
  }

  /**
   * @param {string} actionId 行为定义 id
   * @param {object} input 要改的字段
   */
  updateAction(actionId, input) {
    return this.http.request("PATCH", "/admin/actions/{action_id}", {
      pathParams: { action_id: actionId },
      body: compact(Object.assign({}, input)),
      auth: true,
    })
  }

  /**
   * @param {string} actionId 行为定义 id
   */
  deleteAction(actionId) {
    return this.http.request("DELETE", "/admin/actions/{action_id}", {
      pathParams: { action_id: actionId },
      auth: true,
    })
  }

  /**
   * @param {string} actionId 行为定义 id
   * @param {{limit?: number, offset?: number}} [options] 分页参数
   */
  listActionRecords(actionId, options = {}) {
    return this.http.request("GET", "/admin/actions/{action_id}", {
      pathParams: { action_id: actionId },
      query: { limit: options.limit, offset: options.offset },
      auth: true,
    })
  }

  /**
   * @param {string} actionRecordId 行为记录 id
   */
  getActionRecord(actionRecordId) {
    return this.http.request("GET", "/admin/actions/record/{action_record_id}", {
      pathParams: { action_record_id: actionRecordId },
      auth: true,
    })
  }

  /** @returns 行为定义总数 */
  getActionStatistics() {
    return this.http.request("GET", "/admin/actions/statistics", { auth: true })
  }

  /** @returns 行为记录总数 */
  getActionRecordStatistics() {
    return this.http.request("GET", "/admin/actions/record/statistics", { auth: true })
  }

  // ---- GitHub Webhook ----

  /**
   * @returns 绑定项目的 webhook 配置；secret 不回显，只给末 4 位提示
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
}

/**
 * Verhub SDK 入口。
 *
 * 客户端绑定一个项目：在配置里传入 projectKey 后，项目作用域的方法都用它，
 * 不必再逐次传项目参数。两个命名空间共用一份连接、凭据与来源声明：client.public
 * 不需要凭据，client.admin 需要管理员 JWT 或 API Key。
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
   *   fetch?: typeof fetch,
   *   headers?: Record<string, string>,
   * }} options 客户端配置；baseUrl 须包含 /api/v1 前缀
   */
  constructor(options) {
    this.http = new HttpClient(options)
    this.public = new PublicApi(this.http)
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

  /** 清除当前凭据，之后调用 admin 接口会直接抛错。 */
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

/** 兼容早期版本的旧名字。 */
const VerhubSDK = VerhubClient

export {
  VerhubClient,
  VerhubSDK,
  PublicApi,
  AdminApi,
  VerhubError,
  VerhubApiError,
  VerhubConnectionError,
  detectPlatform,
  detectPlatformVersion,
  compact,
  PLATFORM_HEADER,
  PLATFORM_VERSION_HEADER,
  VERHUB_SDK_VERSION,
}
