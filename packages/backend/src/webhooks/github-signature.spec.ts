import { computeGithubSignature, verifyGithubSignature } from "./github-signature"

const SECRET = "whsec_test_secret_value"
const BODY = JSON.stringify({ action: "published", release: { tag_name: "v1.0.0" } })

describe("github signature", () => {
  it("accepts the signature GitHub would send for the exact bytes", () => {
    const signature = computeGithubSignature(SECRET, BODY)

    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(verifyGithubSignature(SECRET, BODY, signature)).toBe(true)
  })

  it("rejects a signature produced with a different secret", () => {
    const signature = computeGithubSignature("another-secret", BODY)

    expect(verifyGithubSignature(SECRET, BODY, signature)).toBe(false)
  })

  it("rejects a body that was modified after signing", () => {
    const signature = computeGithubSignature(SECRET, BODY)
    const tampered = JSON.stringify({ action: "published", release: { tag_name: "v9.9.9" } })

    expect(verifyGithubSignature(SECRET, tampered, signature)).toBe(false)
  })

  it("rejects a missing or truncated signature header without throwing", () => {
    // timingSafeEqual throws on mismatched buffer lengths; the length guard is
    // what keeps a short header from turning into a 500.
    expect(verifyGithubSignature(SECRET, BODY, undefined)).toBe(false)
    expect(verifyGithubSignature(SECRET, BODY, "sha256=abc")).toBe(false)
    expect(verifyGithubSignature(SECRET, BODY, "")).toBe(false)
  })

  it("signs raw bytes, not a re-serialized object", () => {
    // GitHub signs the delivered body verbatim. Two JSON strings that parse to
    // the same object must not be interchangeable.
    const reordered = JSON.stringify({ release: { tag_name: "v1.0.0" }, action: "published" })

    expect(computeGithubSignature(SECRET, reordered)).not.toBe(computeGithubSignature(SECRET, BODY))
  })
})
