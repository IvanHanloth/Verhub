export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

export type AuthMode = "none" | "bearer" | "api-key" | "signature"

export type ApiParamDoc = {
  name: string
  type: string
  required: boolean
  description: string
  example?: string
}

export type ApiExampleDoc = {
  label: string
  language: "json" | "text"
  content: string
}

export type ApiEndpointDoc = {
  id: string
  slug: string
  module: string
  /**
   * public：无鉴权的客户端接口；admin：管理员 JWT 或 API Key；
   * webhook：第三方回调，只认签名，既不是客户端接口也不接受管理凭据。
   */
  visibility: "public" | "admin" | "webhook"
  title: string
  description: string
  method: HttpMethod
  path: string
  auth: {
    mode: AuthMode
    description: string
  }
  pathParams: ApiParamDoc[]
  queryParams: ApiParamDoc[]
  headers: ApiParamDoc[]
  requestBody?: ApiExampleDoc
  responseBody: ApiExampleDoc
  errorResponses?: ApiExampleDoc[]
  /** OpenAPI 原始 tag，管理端按业务域筛选接口时使用。 */
  tags: string[]
}
