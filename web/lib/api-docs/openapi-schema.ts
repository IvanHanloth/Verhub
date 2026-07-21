import type {
  OpenApiComponents,
  OpenApiDocument,
  OpenApiParameter,
  OpenApiRequestBody,
  OpenApiResponse,
  OpenApiSchema,
} from "./openapi-types"

type ComponentBucket = keyof OpenApiComponents

/**
 * 解析 `#/components/<bucket>/<name>` 形式的本地引用。
 * verhub.openapi.yaml 不使用外部引用，因此只处理本地路径。
 */
function resolveRef<T>(document: OpenApiDocument, ref: string, bucket: ComponentBucket): T {
  const prefix = `#/components/${bucket}/`

  if (!ref.startsWith(prefix)) {
    throw new Error(`无法解析引用：${ref}（期望前缀 ${prefix}）`)
  }

  const name = ref.slice(prefix.length)
  const target = document.components?.[bucket]?.[name as keyof object]

  if (!target) {
    throw new Error(`引用指向的组件不存在：${ref}`)
  }

  return target as T
}

export function resolveSchema(document: OpenApiDocument, schema: OpenApiSchema): OpenApiSchema {
  if (!schema.$ref) {
    return schema
  }

  return resolveSchema(document, resolveRef<OpenApiSchema>(document, schema.$ref, "schemas"))
}

export function resolveParameter(
  document: OpenApiDocument,
  parameter: OpenApiParameter,
): OpenApiParameter {
  if (!parameter.$ref) {
    return parameter
  }

  return resolveRef<OpenApiParameter>(document, parameter.$ref, "parameters")
}

export function resolveResponse(
  document: OpenApiDocument,
  response: OpenApiResponse,
): OpenApiResponse {
  if (!response.$ref) {
    return response
  }

  return resolveRef<OpenApiResponse>(document, response.$ref, "responses")
}

export function resolveRequestBody(
  document: OpenApiDocument,
  requestBody: OpenApiRequestBody,
): OpenApiRequestBody {
  if (!requestBody.$ref) {
    return requestBody
  }

  return resolveRef<OpenApiRequestBody>(document, requestBody.$ref, "requestBodies")
}

function firstType(schema: OpenApiSchema): string | undefined {
  if (Array.isArray(schema.type)) {
    return schema.type.find((item) => item !== "null") ?? schema.type[0]
  }

  return schema.type
}

/** oneOf/anyOf 里挑第一个非 null 分支：文档只展示主形态，null 由描述承担。 */
function pickVariant(schema: OpenApiSchema): OpenApiSchema[] | undefined {
  return schema.oneOf ?? schema.anyOf
}

const FORMAT_EXAMPLES: Record<string, string> = {
  uri: "https://example.com",
  url: "https://example.com",
  email: "user@example.com",
  "date-time": "2026-01-01T00:00:00.000Z",
  date: "2026-01-01",
  uuid: "00000000-0000-0000-0000-000000000000",
}

/**
 * 按 schema 造一份示例 JSON。
 *
 * 取值优先级：`example` > `default` > `enum[0]` > 按 type/format 兜底。
 * yaml 里写了 `example` 的字段会原样透出，因此示例质量由契约文件决定，
 * 而不是由前端硬编码。
 */
export function buildSchemaExample(
  document: OpenApiDocument,
  schema: OpenApiSchema,
  seen: Set<OpenApiSchema> = new Set(),
): unknown {
  const resolved = resolveSchema(document, schema)

  if (resolved.example !== undefined) {
    return resolved.example
  }

  if (resolved.default !== undefined) {
    return resolved.default
  }

  if (resolved.enum?.length) {
    return resolved.enum[0]
  }

  // 自引用 schema（如嵌套树结构）在第二层截断，避免无限递归。
  if (seen.has(resolved)) {
    return null
  }

  const nextSeen = new Set(seen).add(resolved)

  if (resolved.allOf?.length) {
    return resolved.allOf.reduce<Record<string, unknown>>((acc, part) => {
      const value = buildSchemaExample(document, part, nextSeen)
      return value && typeof value === "object" && !Array.isArray(value)
        ? { ...acc, ...(value as Record<string, unknown>) }
        : acc
    }, {})
  }

  const variants = pickVariant(resolved)
  if (variants?.length) {
    const preferred =
      variants.find((item) => resolveSchema(document, item).type !== "null") ?? variants[0]
    return preferred ? buildSchemaExample(document, preferred, nextSeen) : null
  }

  const type = firstType(resolved)

  if (type === "object" || resolved.properties) {
    const entries = Object.entries(resolved.properties ?? {}).map(([key, child]) => [
      key,
      buildSchemaExample(document, child, nextSeen),
    ])
    return Object.fromEntries(entries)
  }

  if (type === "array") {
    return resolved.items ? [buildSchemaExample(document, resolved.items, nextSeen)] : []
  }

  switch (type) {
    case "integer":
    case "number":
      return resolved.minimum ?? 0
    case "boolean":
      return false
    case "null":
      return null
    case "string":
      return resolved.format ? (FORMAT_EXAMPLES[resolved.format] ?? "string") : "string"
    default:
      return null
  }
}

/** 参数表格里展示的类型文案，例如 `string`、`integer`、`string[]`、`ios | android`。 */
export function describeSchemaType(document: OpenApiDocument, schema?: OpenApiSchema): string {
  if (!schema) {
    return "string"
  }

  const resolved = resolveSchema(document, schema)

  if (resolved.enum?.length) {
    return resolved.enum.map((item) => String(item)).join(" | ")
  }

  const variants = pickVariant(resolved)
  if (variants?.length) {
    return variants.map((item) => describeSchemaType(document, item)).join(" | ")
  }

  const type = firstType(resolved) ?? "string"

  if (type === "array") {
    return resolved.items ? `${describeSchemaType(document, resolved.items)}[]` : "array"
  }

  return type
}

/** 把示例对象序列化成文档展示用的 JSON 文本。 */
export function stringifyExample(value: unknown): string {
  return JSON.stringify(value, null, 2)
}
