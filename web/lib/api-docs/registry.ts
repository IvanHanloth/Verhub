import type { ApiEndpointDoc } from "./types"
import { openApiDocument } from "./openapi.generated"
import { buildApiEndpointDocs } from "./openapi-to-docs"

/**
 * 应用内 API 文档注册表。
 *
 * 数据全部来自 verhub.openapi.yaml（经 `pnpm api:sync` 生成的
 * openapi.generated.ts），这里不再手写任何接口描述。
 * 进入文档站的接口由 yaml 里的 `x-verhub-doc: true` 决定。
 */
export const apiEndpointDocs: ApiEndpointDoc[] = buildApiEndpointDocs(openApiDocument)

const endpointMap = new Map(apiEndpointDocs.map((item) => [item.slug, item]))

export function listApiEndpointDocs(): ApiEndpointDoc[] {
  return apiEndpointDocs
}

export function listApiModules(): string[] {
  const modules = new Set(apiEndpointDocs.map((item) => item.module))
  return Array.from(modules)
}

export function getApiEndpointDocBySlug(slug: string): ApiEndpointDoc | undefined {
  return endpointMap.get(slug)
}

/** 按 OpenAPI tag 取接口，供管理端各业务页的接口弹窗使用。 */
export function listApiEndpointDocsByTag(tag: string): ApiEndpointDoc[] {
  return apiEndpointDocs.filter((item) => item.tags.includes(tag))
}
