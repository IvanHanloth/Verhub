import { describe, expect, it } from "vitest"

import { getApiEndpointDocBySlug, listApiEndpointDocs, listApiEndpointDocsByTag } from "./registry"

/**
 * 改造前手写注册表暴露的 29 个接口页地址。
 * /doc/<slug> 是对外链接，管理端接口弹窗也按 slug 深链，必须保持稳定。
 */
const PUBLISHED_SLUGS = [
  "get-public-by-projectkey",
  "get-public-by-projectkey-versions",
  "get-public-by-projectkey-versions-latest",
  "get-public-by-projectkey-versions-latest-preview",
  "get-public-by-projectkey-versions-by-version-by-version",
  "post-public-by-projectkey-versions-check-update",
  "get-public-by-projectkey-announcements",
  "get-public-by-projectkey-announcements-latest",
  "post-public-by-projectkey-feedbacks",
  "post-public-by-projectkey-logs",
  "post-public-by-projectkey-actions",
  "post-admin-projects",
  "delete-admin-projects-by-projectkey",
  "post-admin-projects-by-projectkey-versions",
  "patch-admin-projects-by-projectkey-versions-by-id",
  "delete-admin-projects-by-projectkey-versions-by-id",
  "post-admin-projects-by-projectkey-announcements",
  "patch-admin-projects-by-projectkey-announcements-by-id",
  "delete-admin-projects-by-projectkey-announcements-by-id",
  "get-admin-projects-by-projectkey-feedbacks",
  "patch-admin-projects-by-projectkey-feedbacks-by-id",
  "delete-admin-projects-by-projectkey-feedbacks-by-id",
  "get-admin-projects-by-projectkey-logs",
  "get-admin-projects-by-projectkey-actions",
  "post-admin-projects-actions",
  "patch-admin-actions-by-actionid",
  "delete-admin-actions-by-actionid",
  "get-admin-projects-by-projectkey-stats-requests-overview",
  "get-admin-projects-by-projectkey-stats-requests-timeseries",
]

describe("api endpoint docs registry", () => {
  it("keeps every published /doc URL reachable", () => {
    for (const slug of PUBLISHED_SLUGS) {
      expect(getApiEndpointDocBySlug(slug), `缺少接口文档：${slug}`).toBeDefined()
    }
  })

  it("creates unique slugs for endpoint pages", () => {
    const docs = listApiEndpointDocs()
    const slugSet = new Set(docs.map((item) => item.slug))

    expect(slugSet.size).toBe(docs.length)
  })

  it("fills title, description and response example for every endpoint", () => {
    for (const doc of listApiEndpointDocs()) {
      expect(doc.title, `${doc.slug} 缺少 summary`).not.toBe(doc.path)
      expect(doc.description.length, `${doc.slug} 缺少 description`).toBeGreaterThan(0)
      expect(doc.responseBody.content, `${doc.slug} 缺少响应示例`).not.toBe("null")
    }
  })

  it("derives each endpoint's credential from its path prefix", () => {
    for (const doc of listApiEndpointDocs()) {
      if (doc.path.startsWith("/public/")) {
        expect(doc.visibility, doc.slug).toBe("public")
        expect(doc.auth.mode, doc.slug).toBe("none")
      } else if (doc.path.startsWith("/webhooks/")) {
        // 第三方回调只认签名，既不该冒充公开接口，也不接受管理凭据。
        expect(doc.visibility, doc.slug).toBe("webhook")
        expect(doc.auth.mode, doc.slug).toBe("signature")
        expect(
          doc.headers.some((header) => header.name === "X-Hub-Signature-256"),
          doc.slug,
        ).toBe(true)
        expect(
          doc.headers.some((header) => header.name === "Authorization"),
          doc.slug,
        ).toBe(false)
      } else {
        expect(doc.visibility, doc.slug).toBe("admin")
        expect(doc.auth.mode, doc.slug).toBe("bearer")
        expect(
          doc.headers.some((header) => header.name === "Authorization"),
          doc.slug,
        ).toBe(true)
      }
    }
  })

  it("groups public endpoints under Public and admin endpoints by tag", () => {
    const docs = listApiEndpointDocs()

    expect(docs.filter((item) => item.visibility === "public").map((item) => item.module)).toEqual(
      Array(11).fill("Public"),
    )
    expect(docs.filter((item) => item.visibility === "webhook").map((item) => item.module)).toEqual(
      ["Webhooks"],
    )
    expect(docs.find((item) => item.slug === "post-admin-projects")?.module).toBe("Projects")
    expect(docs.find((item) => item.slug === "get-admin-projects-by-projectkey-logs")?.module).toBe(
      "Logs",
    )
  })

  it("selects endpoints by OpenAPI tag for the admin drawer", () => {
    const versionDocs = listApiEndpointDocsByTag("Versions")

    expect(versionDocs.length).toBeGreaterThan(0)
    expect(versionDocs.every((item) => item.tags.includes("Versions"))).toBe(true)
    expect(versionDocs.some((item) => item.path === "/public/{projectKey}/versions")).toBe(true)
  })
})
