export const VERHUB_SDK_VERSION = "0.1.0"

/**
 * Verhub API 错误对象。
 */
export class VerhubApiError extends Error {
  /**
   * @param {string} message 错误信息
   * @param {number} status HTTP 状态码
   * @param {unknown} body 响应体
   */
  constructor(message, status, body) {
    super(message)
    this.name = "VerhubApiError"
    this.status = status
    this.body = body
  }
}

class VerhubBaseClient {
  /**
   * @param {{baseUrl: string, fetcher?: typeof fetch}} options 客户端配置
   */
  constructor(options) {
    const normalized = String(options.baseUrl || "").trim()
    this.baseUrl = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
    this.fetcher = options.fetcher || fetch
  }

  /**
   * @param {string} method HTTP 方法
   * @param {string} pathTemplate 路径模板
   * @param {{pathParams?: Record<string, string>, query?: Record<string, string | number | boolean | null | undefined>, body?: unknown}} options 请求参数
   */
  async request(method, pathTemplate, options = {}) {
    const path = this.resolvePath(pathTemplate, options.pathParams)
    const url = this.buildUrl(path, options.query)

    const headers = {
      Accept: "application/json",
    }

    let body
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(options.body)
    }

    const response = await this.fetcher(url, {
      method,
      headers,
      body,
    })

    const raw = await response.text()
    let payload = {}
    if (raw) {
      try {
        payload = JSON.parse(raw)
      } catch {
        payload = raw
      }
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && typeof payload.message === "string"
          ? payload.message
          : `Request failed with status ${response.status}`
      throw new VerhubApiError(message, response.status, payload)
    }

    return payload
  }

  /**
   * @param {string} pathTemplate 路径模板
   * @param {Record<string, string>=} pathParams 路径参数
   */
  resolvePath(pathTemplate, pathParams) {
    return pathTemplate.replace(/\{([^}]+)\}/g, (_, key) => {
      const value = pathParams && pathParams[key]
      if (!value) {
        throw new Error(`Missing path param: ${key}`)
      }
      return encodeURIComponent(value)
    })
  }

  /**
   * @param {string} path 已解析路径
   * @param {Record<string, string | number | boolean | null | undefined>=} query 查询参数
   */
  buildUrl(path, query) {
    if (!query) {
      return `${this.baseUrl}${path}`
    }

    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") {
        continue
      }
      params.set(key, String(value))
    }

    const queryString = params.toString()
    return queryString ? `${this.baseUrl}${path}?${queryString}` : `${this.baseUrl}${path}`
  }
}

function compact(input) {
  const out = {}
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null && v !== "") {
      out[k] = v
    }
  }
  return out
}

class VerhubPublicApi {
  /**
   * @param {VerhubBaseClient} client 底层客户端
   */
  constructor(client) {
    this.client = client
  }

  /**
   * @param {string} projectKey 项目标识
   */
  getProjectPublicInfo(projectKey) {
    return this.client.request("GET", "/public/{projectKey}", {
      pathParams: { projectKey },
    })
  }

  /**
   * @param {string} projectKey 项目标识
   * @param {number=} limit 分页大小
   * @param {number=} offset 分页偏移
   */
  listPublicVersions(projectKey, limit, offset) {
    return this.client.request("GET", "/public/{projectKey}/versions", {
      pathParams: { projectKey },
      query: compact({ limit, offset }),
    })
  }

  /**
   * @param {string} projectKey 项目标识
   */
  getLatestPublicVersion(projectKey) {
    return this.client.request("GET", "/public/{projectKey}/versions/latest", {
      pathParams: { projectKey },
    })
  }

  /**
   * @param {string} projectKey 项目标识
   * @param {number=} limit 分页大小
   * @param {number=} offset 分页偏移
   */
  listPublicAnnouncements(projectKey, limit, offset) {
    return this.client.request("GET", "/public/{projectKey}/announcements", {
      pathParams: { projectKey },
      query: compact({ limit, offset }),
    })
  }

  /**
   * @param {string} projectKey 项目标识
   */
  getLatestPublicAnnouncement(projectKey) {
    return this.client.request("GET", "/public/{projectKey}/announcements/latest", {
      pathParams: { projectKey },
    })
  }

  /**
   * @param {string} projectKey 项目标识
   * @param {string} content 反馈内容
   * @param {string=} userId 用户 ID
   * @param {number=} rating 评分
   * @param {string=} platform 平台
   */
  createFeedback(projectKey, content, userId, rating, platform) {
    return this.client.request("POST", "/public/{projectKey}/feedbacks", {
      pathParams: { projectKey },
      body: compact({ user_id: userId, rating, content, platform }),
    })
  }

  /**
   * @param {string} projectKey 项目标识
   * @param {number} level 日志等级
   * @param {string} content 日志内容
   * @param {Record<string, unknown>=} deviceInfo 设备信息
   * @param {Record<string, unknown>=} customData 自定义数据
   */
  createLog(projectKey, level, content, deviceInfo, customData) {
    return this.client.request("POST", "/public/{projectKey}/logs", {
      pathParams: { projectKey },
      body: compact({ level, content, device_info: deviceInfo, custom_data: customData }),
    })
  }

  /**
   * @param {string} projectKey 项目标识
   * @param {string} actionId 行为定义 ID
   * @param {Record<string, unknown>=} http HTTP 上下文
   * @param {Record<string, unknown>=} customData 自定义数据
   */
  createActionRecord(projectKey, actionId, http, customData) {
    return this.client.request("POST", "/public/{projectKey}/actions", {
      pathParams: { projectKey },
      body: compact({ action_id: actionId, http, custom_data: customData }),
    })
  }
}

/**
 * Verhub SDK 统一入口（module 版本）。
 */
export class VerhubSDK {
  static version = VERHUB_SDK_VERSION

  /**
   * @param {{baseUrl: string, fetcher?: typeof fetch}} options 客户端配置
   */
  constructor(options) {
    this.client = new VerhubBaseClient(options)
    this.publicApi = new VerhubPublicApi(this.client)
  }

  /**
   * @param {{baseUrl: string, fetcher?: typeof fetch}} options 客户端配置
   */
  static create(options) {
    return new VerhubSDK(options)
  }
}
