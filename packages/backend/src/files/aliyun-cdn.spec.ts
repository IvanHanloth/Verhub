import { percentEncode, refreshAliyunUrls, signRpcRequest } from "./aliyun-cdn"

describe("aliyun cdn client", () => {
  it("matches the documented RPC signature example", () => {
    const signature = signRpcRequest(
      "GET",
      {
        Timestamp: "2016-02-23T12:46:24Z",
        Format: "XML",
        AccessKeyId: "testid",
        Action: "DescribeRegions",
        SignatureMethod: "HMAC-SHA1",
        SignatureNonce: "3ee8c1b8-83d3-44af-a94f-4e0ad82fd6cf",
        Version: "2014-05-26",
        SignatureVersion: "1.0",
      },
      "testsecret",
    )
    expect(signature).toBe("OLeaidS1JvxuMvnyHOwuJ+uX5qY=")
  })

  it("percent-encodes reserved characters per RFC 3986", () => {
    expect(percentEncode("a b*c~d!'()")).toBe("a%20b%2Ac~d%21%27%28%29")
  })

  it("submits urls in batches of 100 and collects task ids", async () => {
    const bodies: string[] = []
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      bodies.push(String(init?.body))
      return new Response(JSON.stringify({ RefreshTaskId: String(bodies.length) }), { status: 200 })
    })
    try {
      const urls = Array.from({ length: 150 }, (_, i) => `https://cdn.example.com/f/a/${i}/x.zip`)
      const result = await refreshAliyunUrls({ accessKeyId: "id", accessKeySecret: "s" }, urls)

      expect(result.taskIds).toEqual(["1", "2"])
      const first = new URLSearchParams(bodies[0])
      expect(first.get("Action")).toBe("RefreshObjectCaches")
      expect(first.get("ObjectType")).toBe("File")
      expect(first.get("ObjectPath")!.split("\n")).toHaveLength(100)
      expect(first.get("Signature")).toBeTruthy()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("throws the business error returned by aliyun", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          Code: "InvalidAccessKeyId.NotFound",
          Message: "Specified access key is not found.",
        }),
        { status: 404 },
      ),
    )
    try {
      await expect(
        refreshAliyunUrls({ accessKeyId: "id", accessKeySecret: "s" }, ["https://x.test/a"]),
      ).rejects.toThrow("InvalidAccessKeyId.NotFound")
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
