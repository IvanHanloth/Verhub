import { describe, expect, it } from "vitest"

import { listApiEndpointDocs } from "./registry"

describe("api endpoint docs registry", () => {
  it("contains all public-facing API groups", () => {
    const docs = listApiEndpointDocs()

    expect(docs.some((item) => item.path === "/public/{projectKey}" && item.method === "GET")).toBe(
      true,
    )
    expect(
      docs.some((item) => item.path === "/public/{projectKey}/feedbacks" && item.method === "POST"),
    ).toBe(true)
    expect(
      docs.some((item) => item.path === "/public/{projectKey}/logs" && item.method === "POST"),
    ).toBe(true)
    expect(
      docs.some((item) => item.path === "/public/{projectKey}/actions" && item.method === "POST"),
    ).toBe(true)
  })

  it("contains required external admin APIs", () => {
    const docs = listApiEndpointDocs()

    expect(
      docs.some(
        (item) => item.path === "/admin/projects/{projectKey}/versions" && item.method === "POST",
      ),
    ).toBe(true)
    expect(
      docs.some(
        (item) =>
          item.path === "/admin/projects/{projectKey}/versions/{id}" && item.method === "DELETE",
      ),
    ).toBe(true)
    expect(
      docs.some(
        (item) =>
          item.path === "/admin/projects/{projectKey}/announcements" && item.method === "POST",
      ),
    ).toBe(true)
    expect(
      docs.some(
        (item) =>
          item.path === "/admin/projects/{projectKey}/announcements/{id}" &&
          item.method === "PATCH",
      ),
    ).toBe(true)
    expect(
      docs.some(
        (item) =>
          item.path === "/admin/projects/{projectKey}/feedbacks/{id}" && item.method === "PATCH",
      ),
    ).toBe(true)
    expect(
      docs.some(
        (item) =>
          item.path === "/admin/projects/{projectKey}/feedbacks/{id}" && item.method === "DELETE",
      ),
    ).toBe(true)
    expect(
      docs.some(
        (item) => item.path === "/admin/projects/{projectKey}/actions" && item.method === "GET",
      ),
    ).toBe(true)
    expect(
      docs.some((item) => item.path === "/admin/actions/{action_id}" && item.method === "PATCH"),
    ).toBe(true)
  })

  it("creates unique slugs for endpoint pages", () => {
    const docs = listApiEndpointDocs()
    const slugSet = new Set(docs.map((item) => item.slug))

    expect(slugSet.size).toBe(docs.length)
  })
})
