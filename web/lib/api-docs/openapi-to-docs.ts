import type { ApiEndpointDoc, ApiExampleDoc, ApiParamDoc, AuthMode, HttpMethod } from "./types"
import {
  buildSchemaExample,
  describeSchemaType,
  resolveParameter,
  resolveRequestBody,
  resolveResponse,
  stringifyExample,
} from "./openapi-schema"
import {
  OPENAPI_HTTP_METHODS,
  type OpenApiDocument,
  type OpenApiHttpMethod,
  type OpenApiOperation,
  type OpenApiParameter,
  type OpenApiResponse,
  type OpenApiSecurityRequirement,
} from "./openapi-types"
import { createEndpointSlug } from "./utils"

const JSON_MEDIA_TYPE = "application/json"

export type BuildApiEndpointDocsOptions = {
  /**
   * 是否忽略 `x-verhub-doc` 标记、收录 yaml 中的全部操作。
   * 默认 false：只收录显式标记的精选接口。
   */
  includeAll?: boolean
}

function toHttpMethod(method: OpenApiHttpMethod): HttpMethod {
  return method.toUpperCase() as HttpMethod
}

/**
 * 鉴权模式由 security 声明推导：
 * 同时声明 BearerAuth 与 ApiKeyAuth 时按 bearer 展示（两者在服务端等价，
 * 都走 Authorization 头），仅声明 ApiKeyAuth 时才是 x-api-key 形态。
 */
function resolveAuthMode(security?: OpenApiSecurityRequirement[]): AuthMode {
  if (!security?.length) {
    return "none"
  }

  const schemes = new Set(security.flatMap((requirement) => Object.keys(requirement)))

  if (schemes.has("BearerAuth")) {
    return "bearer"
  }

  if (schemes.has("ApiKeyAuth")) {
    return "api-key"
  }

  return "none"
}

function resolveAuthDescription(
  mode: AuthMode,
  security: OpenApiSecurityRequirement[] | undefined,
  path: string,
): string {
  if (mode === "none") {
    return "无需鉴权"
  }

  if (mode === "api-key") {
    return "需要 API Key（x-api-key: <key>）"
  }

  const acceptsApiKey = security?.some((requirement) => "ApiKeyAuth" in requirement) ?? false

  // /auth/* 下的凭据管理接口只接受管理员 JWT，其余 /admin/* 两种凭据等价。
  if (!acceptsApiKey || path.startsWith("/auth/")) {
    return "需要管理员 JWT（Authorization: Bearer <token>）"
  }

  return "需要管理员 JWT 或 API Key，二者等价（Authorization: Bearer <token>）"
}

function toParamDoc(document: OpenApiDocument, parameter: OpenApiParameter): ApiParamDoc {
  const resolved = resolveParameter(document, parameter)
  const example = resolved.example ?? resolved.schema?.example ?? resolved.schema?.default

  return {
    name: resolved.name ?? "",
    type: describeSchemaType(document, resolved.schema),
    required: resolved.required ?? false,
    description: (resolved.description ?? "").trim(),
    example: example === undefined ? undefined : String(example),
  }
}

/**
 * OpenAPI 用 security 表达鉴权，不会把 Authorization 写成 header 参数；
 * 文档的 Header 参数表需要它，因此这里按鉴权模式补出来。
 */
function createAuthHeader(mode: AuthMode): ApiParamDoc | undefined {
  if (mode === "bearer") {
    return {
      name: "Authorization",
      type: "string",
      required: true,
      description: "Bearer <管理员 JWT 或 API Key>",
    }
  }

  if (mode === "api-key") {
    return {
      name: "x-api-key",
      type: "string",
      required: true,
      description: "API Key（vh_ 前缀）",
    }
  }

  return undefined
}

function collectParameters(
  document: OpenApiDocument,
  pathLevel: OpenApiParameter[] | undefined,
  operationLevel: OpenApiParameter[] | undefined,
) {
  const merged = [...(pathLevel ?? []), ...(operationLevel ?? [])].map((parameter) =>
    resolveParameter(document, parameter),
  )

  // 操作级同名参数覆盖路径级声明。
  const byKey = new Map<string, OpenApiParameter>()
  for (const parameter of merged) {
    byKey.set(`${parameter.in}:${parameter.name}`, parameter)
  }

  const all = Array.from(byKey.values())

  return {
    pathParams: all.filter((item) => item.in === "path").map((item) => toParamDoc(document, item)),
    queryParams: all
      .filter((item) => item.in === "query")
      .map((item) => toParamDoc(document, item)),
    headers: all.filter((item) => item.in === "header").map((item) => toParamDoc(document, item)),
  }
}

function buildRequestBodyExample(
  document: OpenApiDocument,
  operation: OpenApiOperation,
): ApiExampleDoc | undefined {
  if (!operation.requestBody) {
    return undefined
  }

  const requestBody = resolveRequestBody(document, operation.requestBody)
  const media = requestBody.content?.[JSON_MEDIA_TYPE]

  if (!media) {
    return undefined
  }

  const example =
    media.example ?? (media.schema ? buildSchemaExample(document, media.schema) : null)

  return {
    label: "请求体",
    language: "json",
    content: stringifyExample(example),
  }
}

function isSuccessStatus(status: string): boolean {
  return /^2\d\d$/.test(status)
}

function buildResponseExamples(document: OpenApiDocument, operation: OpenApiOperation) {
  const entries = Object.entries(operation.responses ?? {}).filter(
    ([status]) => status !== "default",
  )

  const successEntry = entries.find(([status]) => isSuccessStatus(status))
  const responseBody: ApiExampleDoc = successEntry
    ? toResponseExample(document, successEntry[0], successEntry[1], "响应")
    : { label: "响应", language: "json", content: "null" }

  const errorResponses = entries
    .filter(([status]) => !isSuccessStatus(status))
    .map(([status, response]) => toErrorExample(document, status, response))

  return { responseBody, errorResponses }
}

function toResponseExample(
  document: OpenApiDocument,
  status: string,
  rawResponse: OpenApiResponse,
  fallbackLabel: string,
): ApiExampleDoc {
  const response = resolveResponse(document, rawResponse)
  const media = response.content?.[JSON_MEDIA_TYPE]
  const description = (response.description ?? "").trim()

  const example =
    media?.example ?? (media?.schema ? buildSchemaExample(document, media.schema) : null)

  return {
    label: `${status} ${description || fallbackLabel}`,
    language: "json",
    content: stringifyExample(example),
  }
}

/**
 * 错误响应统一按 `{ statusCode, message, error }` 渲染。
 *
 * 全部错误都指向同一个 ErrorResponse schema，照 schema 造例只会得到
 * `statusCode: 0` 这类无意义占位；用状态码与响应描述合成更贴近真实返回。
 * yaml 里显式写了 `example` 时仍以 yaml 为准。
 */
function toErrorExample(
  document: OpenApiDocument,
  status: string,
  rawResponse: OpenApiResponse,
): ApiExampleDoc {
  const response = resolveResponse(document, rawResponse)
  const media = response.content?.[JSON_MEDIA_TYPE]
  const description = (response.description ?? "").trim()
  const label = `${status} ${description || "失败响应"}`

  if (media?.example !== undefined) {
    return { label, language: "json", content: stringifyExample(media.example) }
  }

  return {
    label,
    language: "json",
    content: stringifyExample({
      statusCode: Number(status),
      message: description || "请求失败",
      error: httpErrorName(Number(status)),
    }),
  }
}

function httpErrorName(status: number): string {
  switch (status) {
    case 400:
      return "Bad Request"
    case 401:
      return "Unauthorized"
    case 403:
      return "Forbidden"
    case 404:
      return "Not Found"
    case 409:
      return "Conflict"
    case 422:
      return "Unprocessable Entity"
    default:
      return status >= 500 ? "Internal Server Error" : "Bad Request"
  }
}

/**
 * 文档分组：公开接口统一归到 "Public"，管理接口按 tag 分组。
 * 与改造前手写注册表的分组语义保持一致，`x-verhub-module` 可显式覆盖。
 */
function resolveModule(
  operation: OpenApiOperation,
  visibility: ApiEndpointDoc["visibility"],
): string {
  if (operation["x-verhub-module"]) {
    return operation["x-verhub-module"]
  }

  if (visibility === "public") {
    return "Public"
  }

  return operation.tags?.[0] ?? "Other"
}

export function buildApiEndpointDocs(
  document: OpenApiDocument,
  options: BuildApiEndpointDocsOptions = {},
): ApiEndpointDoc[] {
  const docs: ApiEndpointDoc[] = []

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of OPENAPI_HTTP_METHODS) {
      const operation = pathItem[method]

      if (!operation) {
        continue
      }

      if (!options.includeAll && operation["x-verhub-doc"] !== true) {
        continue
      }

      const security = operation.security
      const authMode = resolveAuthMode(security)
      const visibility = authMode === "none" ? "public" : "admin"
      const { pathParams, queryParams, headers } = collectParameters(
        document,
        pathItem.parameters,
        operation.parameters,
      )
      const authHeader = createAuthHeader(authMode)
      const { responseBody, errorResponses } = buildResponseExamples(document, operation)
      const httpMethod = toHttpMethod(method)

      docs.push({
        id: `${httpMethod}:${path}`,
        slug: createEndpointSlug(httpMethod, path),
        module: resolveModule(operation, visibility),
        visibility,
        title: operation.summary ?? path,
        description: (operation.description ?? operation.summary ?? "").trim(),
        method: httpMethod,
        path,
        auth: {
          mode: authMode,
          description: resolveAuthDescription(authMode, security, path),
        },
        pathParams,
        queryParams,
        headers: authHeader ? [authHeader, ...headers] : headers,
        requestBody: buildRequestBodyExample(document, operation),
        responseBody,
        errorResponses: errorResponses.length ? errorResponses : undefined,
        tags: operation.tags ?? [],
      })
    }
  }

  return docs
}
