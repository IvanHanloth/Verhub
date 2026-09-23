import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"

import { UPLOAD_CHUNK_SIZE } from "./files-config"
import { UploadsService } from "./uploads.service"

function createService() {
  const resolver = {
    resolveCanonicalKeyOrThrow: jest.fn(async (key: string) => {
      if (key !== "app" && key !== "old-app") {
        throw new NotFoundException("Project not found")
      }
      return "app"
    }),
  }
  const backends = { resolveForProject: jest.fn().mockResolvedValue({ id: "local" }) }
  return new UploadsService(resolver as never, backends as never)
}

describe("UploadsService", () => {
  let root: string
  const previous = process.env.VERHUB_STORAGE_DIR

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "verhub-uploads-"))
    process.env.VERHUB_STORAGE_DIR = root
  })

  afterEach(async () => {
    process.env.VERHUB_STORAGE_DIR = previous
    await rm(root, { recursive: true, force: true })
  })

  it("accepts chunks in any order and assembles them with a hash", async () => {
    const service = createService()
    const content = Buffer.alloc(UPLOAD_CHUNK_SIZE + 10, 7)
    const session = await service.create("app", { filename: "../Setup.msi", size: content.length })

    expect(session.filename).toBe("_Setup.msi")
    expect(session.total_chunks).toBe(2)

    await service.putChunk(
      "app",
      session.upload_id,
      1,
      Readable.from([content.subarray(UPLOAD_CHUNK_SIZE)]),
    )
    await service.putChunk(
      "app",
      session.upload_id,
      0,
      Readable.from([content.subarray(0, UPLOAD_CHUNK_SIZE)]),
    )
    expect((await service.status("old-app", session.upload_id)).received_chunks).toEqual([0, 1])

    const target = join(root, "staging", "files", "f1")
    const assembled = await service.assemble("app", session.upload_id, target)

    expect(assembled.bytes).toBe(content.length)
    expect(assembled.sha256).toBe(createHash("sha256").update(content).digest("hex"))
    expect(Buffer.compare(await readFile(target), content)).toBe(0)
    await expect(service.status("app", session.upload_id)).rejects.toBeInstanceOf(NotFoundException)
  })

  it("rejects chunks with the wrong length", async () => {
    const service = createService()
    const session = await service.create("app", { filename: "a.zip", size: 10 })

    await expect(
      service.putChunk("app", session.upload_id, 0, Readable.from([Buffer.alloc(9)])),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.putChunk("app", session.upload_id, 0, Readable.from([Buffer.alloc(11)])),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.putChunk("app", session.upload_id, 1, Readable.from([Buffer.alloc(10)])),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("refuses to assemble while chunks are missing", async () => {
    const service = createService()
    const session = await service.create("app", { filename: "a.zip", size: UPLOAD_CHUNK_SIZE * 2 })

    await expect(
      service.assemble("app", session.upload_id, join(root, "out")),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it("hides sessions from other projects and malformed ids", async () => {
    const service = createService()
    const session = await service.create("app", { filename: "a.zip", size: 1 })

    await expect(service.status("other", session.upload_id)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    await expect(service.status("app", "../../etc")).rejects.toBeInstanceOf(NotFoundException)
  })

  it("rejects files over the size limit", async () => {
    const service = createService()
    process.env.VERHUB_UPLOAD_MAX_MB = "1"
    try {
      await expect(
        service.create("app", { filename: "a.zip", size: 2 * 1024 * 1024 }),
      ).rejects.toThrow(/limit/)
    } finally {
      delete process.env.VERHUB_UPLOAD_MAX_MB
    }
  })

  it("cleans up expired sessions", async () => {
    const service = createService()
    await service.create("app", { filename: "a.zip", size: 1 })
    const now = Date.now()
    jest.spyOn(Date, "now").mockReturnValue(now + 25 * 3600 * 1000)
    try {
      expect(await service.cleanupExpired()).toBe(1)
    } finally {
      jest.restoreAllMocks()
    }
  })
})
