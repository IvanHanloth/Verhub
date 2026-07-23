/**
 * 所有 SDK 异常的基类，便于调用方一次性捕获。
 */
export class VerhubError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VerhubError"
  }
}

/**
 * 服务端返回了非 2xx 响应。
 */
export class VerhubApiError extends VerhubError {
  /** HTTP 状态码。 */
  readonly status: number
  /** 已解析的响应体；解析失败时是原始文本。 */
  readonly body: unknown

  /**
   * @param message 错误信息，优先取响应体的 message 字段
   * @param status HTTP 状态码
   * @param body 已解析的响应体
   */
  constructor(message: string, status: number, body: unknown = null) {
    super(message)
    this.name = "VerhubApiError"
    this.status = status
    this.body = body
  }
}

/**
 * 请求没能到达服务端（超时、DNS、连接被拒等）。
 */
export class VerhubConnectionError extends VerhubError {
  /** 底层异常。 */
  readonly cause: unknown

  /**
   * @param message 错误信息
   * @param cause 底层异常
   */
  constructor(message: string, cause: unknown) {
    super(message)
    this.name = "VerhubConnectionError"
    this.cause = cause
  }
}
