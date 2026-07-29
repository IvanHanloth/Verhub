import { openSecret, sealSecret, secretFingerprint } from "./secret-box"

describe("secret-box", () => {
  const originalSecret = process.env.JWT_SECRET

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret"
  })

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret
  })

  it("round-trips a secret", () => {
    const sealed = sealSecret("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----", "t")
    expect(sealed.startsWith("v1:")).toBe(true)
    expect(openSecret(sealed, "t")).toContain("BEGIN PRIVATE KEY")
  })

  it("uses a unique iv per seal", () => {
    expect(sealSecret("same", "t")).not.toBe(sealSecret("same", "t"))
  })

  it("rejects a ciphertext sealed for another purpose", () => {
    const sealed = sealSecret("value", "purpose-a")
    expect(() => openSecret(sealed, "purpose-b")).toThrow()
  })

  it("rejects malformed input", () => {
    expect(() => openSecret("not-a-sealed-secret", "t")).toThrow("unrecognized format")
  })

  it("throws without JWT_SECRET", () => {
    delete process.env.JWT_SECRET
    expect(() => sealSecret("value", "t")).toThrow("JWT_SECRET")
  })

  it("fingerprint is stable and short", () => {
    expect(secretFingerprint("abc")).toBe(secretFingerprint("abc"))
    expect(secretFingerprint("abc")).toHaveLength(16)
    expect(secretFingerprint("abc")).not.toBe(secretFingerprint("abd"))
  })
})
