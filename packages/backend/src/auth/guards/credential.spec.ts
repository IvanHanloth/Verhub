import { extractApiKey, extractBearerToken } from "./credential"

const req = (headers: Record<string, string | string[] | undefined>) => ({ headers })

describe("extractBearerToken", () => {
  it("reads the bearer payload", () => {
    expect(extractBearerToken(req({ authorization: "Bearer abc" }))).toBe("abc")
  })

  it("accepts a lowercase scheme", () => {
    expect(extractBearerToken(req({ authorization: "bearer abc" }))).toBe("abc")
  })

  it("ignores a non-bearer scheme", () => {
    expect(extractBearerToken(req({ authorization: "Basic abc" }))).toBeUndefined()
  })

  it("ignores an empty bearer payload", () => {
    expect(extractBearerToken(req({ authorization: "Bearer   " }))).toBeUndefined()
  })

  it("returns undefined without an authorization header", () => {
    expect(extractBearerToken(req({}))).toBeUndefined()
  })
})

describe("extractApiKey", () => {
  it("reads the legacy x-api-key header", () => {
    expect(extractApiKey(req({ "x-api-key": "vh_abc" }))).toBe("vh_abc")
  })

  it("takes the first value of an array header", () => {
    expect(extractApiKey(req({ "x-api-key": ["vh_first", "vh_second"] }))).toBe("vh_first")
  })

  it("reads a vh_-prefixed bearer token", () => {
    expect(extractApiKey(req({ authorization: "Bearer vh_abc" }))).toBe("vh_abc")
  })

  it("does not treat a JWT bearer token as an api key", () => {
    expect(extractApiKey(req({ authorization: "Bearer eyJhbGci.eyJzdWIi.sig" }))).toBeUndefined()
  })

  it("prefers x-api-key when both headers are present", () => {
    expect(
      extractApiKey(req({ "x-api-key": "vh_header", authorization: "Bearer vh_bearer" })),
    ).toBe("vh_header")
  })

  it("returns undefined when no credential is present", () => {
    expect(extractApiKey(req({}))).toBeUndefined()
  })
})
