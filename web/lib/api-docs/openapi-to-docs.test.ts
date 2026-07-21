import { describe, expect, it } from "vitest"

import { buildApiEndpointDocs } from "./openapi-to-docs"
import type { OpenApiDocument } from "./openapi-types"

function createDocument(overrides: Partial<OpenApiDocument> = {}): OpenApiDocument {
  return {
    openapi: "3.1.0",
    info: { title: "Test", version: "1.0.0" },
    paths: {},
    ...overrides,
  }
}

describe("buildApiEndpointDocs", () => {
  it("only collects operations marked with x-verhub-doc", () => {
    const document = createDocument({
      paths: {
        "/public/ping": {
          get: { summary: "ping", "x-verhub-doc": true, responses: {} },
        },
        "/public/internal": {
          get: { summary: "internal", responses: {} },
        },
      },
    })

    expect(buildApiEndpointDocs(document).map((item) => item.path)).toEqual(["/public/ping"])
    expect(buildApiEndpointDocs(document, { includeAll: true })).toHaveLength(2)
  })

  it("derives visibility and auth from the security requirement", () => {
    const document = createDocument({
      paths: {
        "/admin/things": {
          post: {
            summary: "创建",
            "x-verhub-doc": true,
            security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
            responses: {},
          },
        },
        "/public/things": {
          get: { summary: "查询", "x-verhub-doc": true, responses: {} },
        },
      },
    })

    const [admin, publicDoc] = buildApiEndpointDocs(document)

    expect(admin?.visibility).toBe("admin")
    expect(admin?.auth.mode).toBe("bearer")
    expect(admin?.headers[0]?.name).toBe("Authorization")
    expect(publicDoc?.visibility).toBe("public")
    expect(publicDoc?.auth).toEqual({ mode: "none", description: "无需鉴权" })
  })

  it("only accepts admin JWT for credential management routes", () => {
    const document = createDocument({
      paths: {
        "/auth/tokens": {
          post: {
            summary: "创建 Token",
            "x-verhub-doc": true,
            security: [{ BearerAuth: [] }],
            responses: {},
          },
        },
      },
    })

    expect(buildApiEndpointDocs(document)[0]?.auth.description).toBe(
      "需要管理员 JWT（Authorization: Bearer <token>）",
    )
  })

  it("merges path-level and operation-level parameters, operation wins", () => {
    const document = createDocument({
      paths: {
        "/public/{key}": {
          parameters: [
            { name: "key", in: "path", required: true, description: "路径级", schema: {} },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          get: {
            summary: "查询",
            "x-verhub-doc": true,
            parameters: [
              { name: "key", in: "path", required: true, description: "操作级", schema: {} },
            ],
            responses: {},
          },
        },
      },
    })

    const doc = buildApiEndpointDocs(document)[0]

    expect(doc?.pathParams).toEqual([
      { name: "key", type: "string", required: true, description: "操作级", example: undefined },
    ])
    expect(doc?.queryParams[0]?.example).toBe("20")
  })

  it("builds request and response examples from schemas", () => {
    const document = createDocument({
      paths: {
        "/public/things": {
          post: {
            summary: "创建",
            "x-verhub-doc": true,
            requestBody: {
              content: { "application/json": { schema: { $ref: "#/components/schemas/Thing" } } },
            },
            responses: {
              "201": {
                description: "创建成功",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        total: { type: "integer", example: 1 },
                        data: {
                          type: "array",
                          items: { $ref: "#/components/schemas/Thing" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Thing: {
            type: "object",
            properties: { name: { type: "string" } },
            example: { name: "verhub" },
          },
        },
      },
    })

    const doc = buildApiEndpointDocs(document)[0]

    expect(doc?.requestBody?.content).toBe('{\n  "name": "verhub"\n}')
    expect(doc?.responseBody.label).toBe("201 创建成功")
    expect(JSON.parse(doc?.responseBody.content ?? "null")).toEqual({
      total: 1,
      data: [{ name: "verhub" }],
    })
  })

  it("renders error responses from status code and description", () => {
    const document = createDocument({
      paths: {
        "/public/things": {
          get: {
            summary: "查询",
            "x-verhub-doc": true,
            responses: {
              "200": { description: "成功", content: {} },
              "404": { $ref: "#/components/responses/NotFound" },
            },
          },
        },
      },
      components: {
        responses: {
          NotFound: {
            description: "资源不存在",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    })

    const doc = buildApiEndpointDocs(document)[0]

    expect(doc?.errorResponses?.[0]?.label).toBe("404 资源不存在")
    expect(JSON.parse(doc?.errorResponses?.[0]?.content ?? "null")).toEqual({
      statusCode: 404,
      message: "资源不存在",
      error: "Not Found",
    })
  })

  it("describes enum and array parameter types", () => {
    const document = createDocument({
      paths: {
        "/public/things": {
          get: {
            summary: "查询",
            "x-verhub-doc": true,
            parameters: [
              { name: "platform", in: "query", schema: { type: "string", enum: ["ios", "web"] } },
              { name: "ids", in: "query", schema: { type: "array", items: { type: "string" } } },
            ],
            responses: {},
          },
        },
      },
    })

    const doc = buildApiEndpointDocs(document)[0]

    expect(doc?.queryParams.map((item) => item.type)).toEqual(["ios | web", "string[]"])
  })
})
