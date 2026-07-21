// verhub.openapi.yaml 用到的 OpenAPI 3.1 子集。
// 只声明生成文档真正需要的字段，避免引入完整的 openapi-types 依赖。

export type OpenApiRef = {
  $ref: string
}

export type OpenApiSchema = {
  $ref?: string
  type?: string | string[]
  format?: string
  description?: string
  example?: unknown
  default?: unknown
  enum?: unknown[]
  required?: string[]
  properties?: Record<string, OpenApiSchema>
  items?: OpenApiSchema
  allOf?: OpenApiSchema[]
  oneOf?: OpenApiSchema[]
  anyOf?: OpenApiSchema[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  additionalProperties?: boolean | OpenApiSchema
}

export type OpenApiParameter = {
  $ref?: string
  name?: string
  in?: "path" | "query" | "header" | "cookie"
  required?: boolean
  description?: string
  example?: unknown
  schema?: OpenApiSchema
}

export type OpenApiMediaType = {
  schema?: OpenApiSchema
  example?: unknown
}

export type OpenApiRequestBody = {
  $ref?: string
  required?: boolean
  description?: string
  content?: Record<string, OpenApiMediaType>
}

export type OpenApiResponse = {
  $ref?: string
  description?: string
  content?: Record<string, OpenApiMediaType>
}

export type OpenApiSecurityRequirement = Record<string, string[]>

export type OpenApiOperation = {
  tags?: string[]
  summary?: string
  description?: string
  operationId?: string
  parameters?: OpenApiParameter[]
  requestBody?: OpenApiRequestBody
  responses?: Record<string, OpenApiResponse>
  security?: OpenApiSecurityRequirement[]
  /** 标记该操作进入应用内 /doc 文档站与管理端接口弹窗。 */
  "x-verhub-doc"?: boolean
  /** 覆盖文档分组名；缺省时由 openapi-to-docs 按可见性与 tag 推导。 */
  "x-verhub-module"?: string
}

export type OpenApiPathItem = {
  parameters?: OpenApiParameter[]
} & Partial<Record<OpenApiHttpMethod, OpenApiOperation>>

export type OpenApiHttpMethod = "get" | "post" | "put" | "patch" | "delete"

export type OpenApiSecurityScheme = {
  type?: string
  scheme?: string
  bearerFormat?: string
  in?: string
  name?: string
  description?: string
}

export type OpenApiComponents = {
  schemas?: Record<string, OpenApiSchema>
  parameters?: Record<string, OpenApiParameter>
  responses?: Record<string, OpenApiResponse>
  requestBodies?: Record<string, OpenApiRequestBody>
  securitySchemes?: Record<string, OpenApiSecurityScheme>
}

export type OpenApiDocument = {
  openapi: string
  info: {
    title: string
    version: string
    description?: string
  }
  servers?: { url: string; description?: string }[]
  tags?: { name: string; description?: string }[]
  paths: Record<string, OpenApiPathItem>
  components?: OpenApiComponents
}

export const OPENAPI_HTTP_METHODS: OpenApiHttpMethod[] = ["get", "post", "put", "patch", "delete"]
