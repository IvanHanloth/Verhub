import type { ApiEndpointDoc, ApiExampleDoc } from "./types"

function createErrorBody(status: number, message: string): ApiExampleDoc {
  return {
    label: `${status} 失败响应`,
    language: "json",
    content: `{
  "statusCode": ${status},
  "message": "${message}",
  "error": "${status >= 500 ? "Internal Server Error" : "Bad Request"}"
}`,
  }
}

export function getDefaultErrorResponses(doc: ApiEndpointDoc): ApiExampleDoc[] {
  const list: ApiExampleDoc[] = []

  if (doc.pathParams.length || doc.queryParams.length) {
    list.push(createErrorBody(400, "请求参数不合法"))
  }

  if (doc.auth.mode !== "none") {
    list.push(createErrorBody(401, "未授权或令牌无效"))
  }

  if (doc.method === "GET" || doc.method === "PATCH" || doc.method === "DELETE") {
    list.push(createErrorBody(404, "资源不存在"))
  }

  if (doc.method === "POST") {
    list.push(createErrorBody(409, "资源冲突或重复创建"))
  }

  // 保持顺序稳定并去重
  const byLabel = new Map<string, ApiExampleDoc>()
  for (const item of list) {
    byLabel.set(item.label, item)
  }

  return Array.from(byLabel.values())
}
