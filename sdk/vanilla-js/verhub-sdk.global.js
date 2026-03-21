;(function (global) {
  "use strict"

  var VERHUB_SDK_VERSION = "0.1.0"

  /**
   * Verhub API 错误对象。
   * @param {string} message 错误信息
   * @param {number} status HTTP 状态码
   * @param {unknown} body 响应体
   */
  function VerhubApiError(message, status, body) {
    Error.call(this, message)
    this.name = "VerhubApiError"
    this.message = message
    this.status = status
    this.body = body
  }
  VerhubApiError.prototype = Object.create(Error.prototype)
  VerhubApiError.prototype.constructor = VerhubApiError

  /**
   * @param {{baseUrl: string, fetcher?: typeof fetch}} options 客户端配置
   */
  function VerhubBaseClient(options) {
    var normalized = String((options && options.baseUrl) || "").trim()
    this.baseUrl = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
    this.fetcher = (options && options.fetcher) || global.fetch
  }

  /**
   * @param {string} method HTTP 方法
   * @param {string} pathTemplate 路径模板
   * @param {{pathParams?: Record<string, string>, query?: Record<string, string | number | boolean | null | undefined>, body?: unknown}=} options 请求参数
   */
  VerhubBaseClient.prototype.request = async function (method, pathTemplate, options) {
    options = options || {}
    var path = this.resolvePath(pathTemplate, options.pathParams)
    var url = this.buildUrl(path, options.query)

    var headers = {
      Accept: "application/json",
    }

    var body
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(options.body)
    }

    var response = await this.fetcher(url, {
      method: method,
      headers: headers,
      body: body,
    })

    var raw = await response.text()
    var payload = {}
    if (raw) {
      try {
        payload = JSON.parse(raw)
      } catch (_err) {
        payload = raw
      }
    }

    if (!response.ok) {
      var message =
        payload && typeof payload === "object" && typeof payload.message === "string"
          ? payload.message
          : "Request failed with status " + response.status
      throw new VerhubApiError(message, response.status, payload)
    }

    return payload
  }

  /**
   * @param {string} pathTemplate 路径模板
   * @param {Record<string, string>=} pathParams 路径参数
   */
  VerhubBaseClient.prototype.resolvePath = function (pathTemplate, pathParams) {
    return pathTemplate.replace(/\{([^}]+)\}/g, function (_, key) {
      var value = pathParams && pathParams[key]
      if (!value) {
        throw new Error("Missing path param: " + key)
      }
      return encodeURIComponent(value)
    })
  }

  /**
   * @param {string} path 已解析路径
   * @param {Record<string, string | number | boolean | null | undefined>=} query 查询参数
   */
  VerhubBaseClient.prototype.buildUrl = function (path, query) {
    if (!query) {
      return this.baseUrl + path
    }

    var params = new URLSearchParams()
    Object.entries(query).forEach(function (entry) {
      var key = entry[0]
      var value = entry[1]
      if (value === undefined || value === null || value === "") {
        return
      }
      params.set(key, String(value))
    })

    var queryString = params.toString()
    return queryString ? this.baseUrl + path + "?" + queryString : this.baseUrl + path
  }

  function compact(input) {
    var out = {}
    Object.entries(input).forEach(function (entry) {
      var key = entry[0]
      var value = entry[1]
      if (value !== undefined && value !== null && value !== "") {
        out[key] = value
      }
    })
    return out
  }

  /**
   * @param {VerhubBaseClient} client 底层客户端
   */
  function VerhubPublicApi(client) {
    this.client = client
  }

  /**
   * @param {string} projectKey 项目标识
   */
  VerhubPublicApi.prototype.getProjectPublicInfo = function (projectKey) {
    return this.client.request("GET", "/public/{projectKey}", {
      pathParams: { projectKey: projectKey },
    })
  }

  /**
   * @param {string} projectKey 项目标识
   * @param {number=} limit 分页大小
   * @param {number=} offset 分页偏移
   */
  VerhubPublicApi.prototype.listPublicVersions = function (projectKey, limit, offset) {
    return this.client.request("GET", "/public/{projectKey}/versions", {
      pathParams: { projectKey: projectKey },
      query: compact({ limit: limit, offset: offset }),
    })
  }

  /**
   * @param {string} projectKey 项目标识
   */
  VerhubPublicApi.prototype.getLatestPublicVersion = function (projectKey) {
    return this.client.request("GET", "/public/{projectKey}/versions/latest", {
      pathParams: { projectKey: projectKey },
    })
  }

  /**
   * @param {string} projectKey 项目标识
   * @param {number=} limit 分页大小
   * @param {number=} offset 分页偏移
   */
  VerhubPublicApi.prototype.listPublicAnnouncements = function (projectKey, limit, offset) {
    return this.client.request("GET", "/public/{projectKey}/announcements", {
      pathParams: { projectKey: projectKey },
      query: compact({ limit: limit, offset: offset }),
    })
  }

  /**
   * @param {string} projectKey 项目标识
   */
  VerhubPublicApi.prototype.getLatestPublicAnnouncement = function (projectKey) {
    return this.client.request("GET", "/public/{projectKey}/announcements/latest", {
      pathParams: { projectKey: projectKey },
    })
  }

  /**
   * @param {string} projectKey 项目标识
   * @param {string} content 反馈内容
   * @param {string=} userId 用户 ID
   * @param {number=} rating 评分
   * @param {string=} platform 平台
   */
  VerhubPublicApi.prototype.createFeedback = function (projectKey, content, userId, rating, platform) {
    return this.client.request("POST", "/public/{projectKey}/feedbacks", {
      pathParams: { projectKey: projectKey },
      body: compact({ user_id: userId, rating: rating, content: content, platform: platform }),
    })
  }

  /**
   * @param {string} projectKey 项目标识
   * @param {number} level 日志等级
   * @param {string} content 日志内容
   * @param {Record<string, unknown>=} deviceInfo 设备信息
   * @param {Record<string, unknown>=} customData 自定义数据
   */
  VerhubPublicApi.prototype.createLog = function (projectKey, level, content, deviceInfo, customData) {
    return this.client.request("POST", "/public/{projectKey}/logs", {
      pathParams: { projectKey: projectKey },
      body: compact({ level: level, content: content, device_info: deviceInfo, custom_data: customData }),
    })
  }

  /**
   * @param {string} projectKey 项目标识
   * @param {string} actionId 行为定义 ID
   * @param {Record<string, unknown>=} http HTTP 上下文
   * @param {Record<string, unknown>=} customData 自定义数据
   */
  VerhubPublicApi.prototype.createActionRecord = function (projectKey, actionId, http, customData) {
    return this.client.request("POST", "/public/{projectKey}/actions", {
      pathParams: { projectKey: projectKey },
      body: compact({ action_id: actionId, http: http, custom_data: customData }),
    })
  }

  /**
   * Verhub SDK 统一入口（global 版本）。
   * @param {{baseUrl: string, fetcher?: typeof fetch}} options 客户端配置
   */
  function VerhubSDK(options) {
    this.client = new VerhubBaseClient(options)
    this.publicApi = new VerhubPublicApi(this.client)
  }

  /**
   * @param {{baseUrl: string, fetcher?: typeof fetch}} options 客户端配置
   */
  VerhubSDK.create = function (options) {
    return new VerhubSDK(options)
  }

  VerhubSDK.version = VERHUB_SDK_VERSION
  VerhubSDK.ApiError = VerhubApiError

  global.VerhubSDK = VerhubSDK
})(typeof window !== "undefined" ? window : globalThis)
