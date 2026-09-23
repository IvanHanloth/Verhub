import {
  buildDistUrl,
  buildObjectKey,
  contentDisposition,
  generateFileId,
  guessContentType,
  sanitizeFilename,
} from "./file-naming"
import { matchesEtag } from "./dist.controller"
import { toCdnOriginHint } from "./storage-backends.service"

describe("file naming", () => {
  it("generates 12-char lowercase ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateFileId()))
    expect(ids.size).toBe(200)
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]{12}$/)
    }
  })

  it.each([
    ["Setup 1.2.0.msi", "Setup 1.2.0.msi"],
    ["../../etc/passwd", "_.._etc_passwd"],
    ['a/b\\c:d*e?f"g<h>i|j', "a_b_c_d_e_f_g_h_i_j"],
    ["  ..hidden.exe  ", "hidden.exe"],
    ["安装包 v2.exe", "安装包 v2.exe"],
    ["trailing.", "trailing"],
  ])("sanitizes %p", (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected)
  })

  it("rejects names with no usable characters", () => {
    expect(sanitizeFilename("  ")).toBeNull()
    expect(sanitizeFilename("...")).toBeNull()
  })

  it("truncates long names and keeps the extension", () => {
    const name = sanitizeFilename(`${"x".repeat(300)}.msixbundle`)!
    expect(name.length).toBe(180)
    expect(name.endsWith(".msixbundle")).toBe(true)
  })

  it("builds object keys and encoded urls", () => {
    const key = buildObjectKey("my/app", "abc123", "安装 包.exe")
    expect(key).toBe("f/my_app/abc123/安装 包.exe")
    expect(buildDistUrl("https://cdn.example.com", key)).toBe(
      "https://cdn.example.com/f/my_app/abc123/%E5%AE%89%E8%A3%85%20%E5%8C%85.exe",
    )
    expect(buildDistUrl(null, key)).toBe("/f/my_app/abc123/%E5%AE%89%E8%A3%85%20%E5%8C%85.exe")
  })

  it("guesses store package content types", () => {
    expect(guessContentType("App.MSIX")).toBe("application/msix")
    expect(guessContentType("setup.msi")).toBe("application/x-msi")
    expect(guessContentType("unknown.bin")).toBe("application/octet-stream")
  })

  it("encodes non-ascii filenames in Content-Disposition", () => {
    expect(contentDisposition("安装.exe", "application/octet-stream")).toBe(
      `attachment; filename="__.exe"; filename*=UTF-8''%E5%AE%89%E8%A3%85.exe`,
    )
    expect(contentDisposition("icon.png", "image/png")).toMatch(/^inline;/)
  })
})

describe("matchesEtag", () => {
  const etag = '"abc"'

  it.each([
    ['"abc"', true],
    ['W/"abc"', true],
    ['"x", "abc"', true],
    ["*", true],
    ['"x"', false],
  ])("%p -> %p", (header, expected) => {
    expect(matchesEtag(header, etag)).toBe(expected)
  })

  it("treats a missing header as no match", () => {
    expect(matchesEtag(undefined, etag)).toBe(false)
  })
})

describe("toCdnOriginHint", () => {
  it("splits a WebDAV base url into origin host and path prefix", () => {
    expect(toCdnOriginHint("https://dav.example.com:8443/remote.php/dav/files/u/verhub")).toEqual({
      scheme: "https",
      host: "dav.example.com:8443",
      path_prefix: "/remote.php/dav/files/u/verhub",
    })
    expect(toCdnOriginHint("http://nas.local")).toEqual({
      scheme: "http",
      host: "nas.local",
      path_prefix: "",
    })
  })
})
