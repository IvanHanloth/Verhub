import { describe, expect, it } from "vitest"

import { buildTryItOutUrl, createEndpointSlug, resolvePathTemplate } from "./utils"

describe("api-docs utils", () => {
  it("creates stable endpoint slug from method and path", () => {
    const slug = createEndpointSlug("PATCH", "/admin/projects/{projectKey}/versions/{id}")

    expect(slug).toBe("patch-admin-projects-by-projectkey-versions-by-id")
  })

  it("replaces url template params and encodes values", () => {
    const resolved = resolvePathTemplate("/public/{projectKey}/versions/{id}", {
      projectKey: "ver hub",
      id: "v/1",
    })

    expect(resolved).toBe("/public/ver%20hub/versions/v%2F1")
  })

  it("keeps unresolved params and appends non-empty query params", () => {
    const url = buildTryItOutUrl(
      "/admin/projects/{projectKey}/versions",
      { projectKey: "" },
      { limit: "20", offset: "0", search: "" },
    )

    expect(url).toBe("/api/v1/admin/projects/{projectKey}/versions?limit=20&offset=0")
  })
})
