import {
  githubAssetFilename,
  isGithubReleaseAsset,
  replaceVersionUrl,
  urlHasPath,
  versionUrls,
} from "./download-links"

const ASSET = "https://github.com/acme/app/releases/download/v1.2.0/App%20Setup.msi"

describe("download links", () => {
  it("recognizes GitHub release asset urls only", () => {
    expect(isGithubReleaseAsset(ASSET)).toBe(true)
    expect(isGithubReleaseAsset("https://github.com/acme/app/archive/refs/tags/v1.zip")).toBe(false)
    expect(isGithubReleaseAsset("https://api.github.com/repos/acme/app/zipball/v1")).toBe(false)
    expect(isGithubReleaseAsset("https://example.com/releases/download/v1/a.zip")).toBe(false)
  })

  it("decodes the asset filename", () => {
    expect(githubAssetFilename(ASSET)).toBe("App Setup.msi")
  })

  it("matches links by path regardless of origin", () => {
    const path = "/f/app/abc/App%20Setup.msi"
    expect(urlHasPath(`https://cdn.example.com${path}`, path)).toBe(true)
    expect(urlHasPath(`https://old.example.com${path}?t=1`, path)).toBe(true)
    expect(urlHasPath("https://cdn.example.com/f/app/abc/Other.msi", path)).toBe(false)
  })

  it("replaces a url in both downloadUrl and downloadLinks", () => {
    const result = replaceVersionUrl(
      {
        downloadUrl: ASSET,
        downloadLinks: [
          { url: ASSET, name: "Windows", platform: "windows" },
          { url: "https://example.com/other.zip" },
        ],
      },
      ASSET,
      "https://cdn.example.com/f/app/abc/App%20Setup.msi",
    )

    expect(result).toEqual({
      downloadUrl: "https://cdn.example.com/f/app/abc/App%20Setup.msi",
      downloadLinks: [
        {
          url: "https://cdn.example.com/f/app/abc/App%20Setup.msi",
          name: "Windows",
          platform: "windows",
        },
        { url: "https://example.com/other.zip", name: undefined, platform: undefined },
      ],
    })
  })

  it("returns null when nothing matches", () => {
    expect(
      replaceVersionUrl(
        { downloadUrl: null, downloadLinks: [{ url: "https://x.test/a" }] },
        ASSET,
        "b",
      ),
    ).toBeNull()
  })

  it("collects unique version urls", () => {
    expect(
      versionUrls({
        downloadUrl: ASSET,
        downloadLinks: [{ url: ASSET }, { url: "https://x.test/a" }],
      }),
    ).toEqual([ASSET, "https://x.test/a"])
  })
})
