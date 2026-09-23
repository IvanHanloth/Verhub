/** 阿里云 CDN OpenAPI（RPC 风格，版本 2018-05-10）的最小客户端。 */

import { createHmac, randomUUID } from "node:crypto"

const ENDPOINT = "https://cdn.aliyuncs.com/"
const API_VERSION = "2018-05-10"
const REQUEST_TIMEOUT_MS = 15_000

/** 单次 RefreshObjectCaches 最多提交的 URL 数。 */
export const ALIYUN_REFRESH_BATCH = 100

export type AliyunCredentials = { accessKeyId: string; accessKeySecret: string }

/** 阿里云接口返回的业务错误。 */
export class AliyunApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(`${code}: ${message}`)
  }
}

/** RPC 签名使用的百分号编码（RFC 3986，空格为 %20）。 */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** 计算 RPC 签名：HMAC-SHA1(secret + "&", "GET&%2F&" + 编码后的规范化参数)，Base64 输出。 */
export function signRpcRequest(
  method: "GET" | "POST",
  params: Record<string, string>,
  accessKeySecret: string,
): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key]!)}`)
    .join("&")
  const stringToSign = `${method}&${percentEncode("/")}&${percentEncode(canonical)}`
  return createHmac("sha1", `${accessKeySecret}&`).update(stringToSign).digest("base64")
}

/** 调用一个 CDN 接口，返回解析后的 JSON；业务错误抛 AliyunApiError。 */
export async function callAliyunCdn<T>(
  credentials: AliyunCredentials,
  action: string,
  params: Record<string, string> = {},
): Promise<T> {
  const all: Record<string, string> = {
    ...params,
    Action: action,
    Format: "JSON",
    Version: API_VERSION,
    AccessKeyId: credentials.accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  }
  all.Signature = signRpcRequest("POST", all, credentials.accessKeySecret)

  const body = Object.entries(all)
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&")
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok || typeof payload.Code === "string") {
    throw new AliyunApiError(
      String(payload.Code ?? `HTTP${response.status}`),
      String(payload.Message ?? "Request failed"),
      response.status,
    )
  }
  return payload as T
}

export type AliyunRefreshResult = { taskIds: string[] }

/** 刷新文件缓存（ObjectType=File），按批提交，返回各批的任务 ID。 */
export async function refreshAliyunUrls(
  credentials: AliyunCredentials,
  urls: string[],
): Promise<AliyunRefreshResult> {
  const taskIds: string[] = []
  for (let start = 0; start < urls.length; start += ALIYUN_REFRESH_BATCH) {
    const batch = urls.slice(start, start + ALIYUN_REFRESH_BATCH)
    const result = await callAliyunCdn<{ RefreshTaskId?: string }>(
      credentials,
      "RefreshObjectCaches",
      { ObjectPath: batch.join("\n"), ObjectType: "File" },
    )
    if (result.RefreshTaskId) {
      taskIds.push(result.RefreshTaskId)
    }
  }
  return { taskIds }
}

export type AliyunRefreshQuota = { urlRemain: number; urlQuota: number }

/** 查询当日 URL 刷新余量，用作连接测试。 */
export async function describeAliyunRefreshQuota(
  credentials: AliyunCredentials,
): Promise<AliyunRefreshQuota> {
  const result = await callAliyunCdn<{ UrlRemain?: string; UrlQuota?: string }>(
    credentials,
    "DescribeRefreshQuota",
  )
  return { urlRemain: Number(result.UrlRemain ?? 0), urlQuota: Number(result.UrlQuota ?? 0) }
}
