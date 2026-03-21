export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

export type AuthMode = "none" | "bearer" | "api-key"

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
  visibility: "public" | "admin"
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
}
