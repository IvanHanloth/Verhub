/** 落盘流工具。 */

import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { Readable, Transform, type TransformCallback } from "node:stream"
import { pipeline } from "node:stream/promises"

/** 超过字节上限时抛出。 */
export class SizeLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Content exceeds ${limit} bytes`)
  }
}

/** 计数并在超出上限时中断的透传流，同时累计 SHA-256。 */
class MeteredHash extends Transform {
  bytes = 0
  private readonly hash = createHash("sha256")

  constructor(private readonly limit: number) {
    super()
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytes += chunk.length
    if (this.bytes > this.limit) {
      callback(new SizeLimitError(this.limit))
      return
    }
    this.hash.update(chunk)
    callback(null, chunk)
  }

  digest(): string {
    return this.hash.digest("hex")
  }
}

/**
 * 把 source 写入 target，返回写入字节数与 SHA-256。
 * 超过 maxBytes 时抛 SizeLimitError，已写入的部分由调用方清理。
 */
export async function writeWithHash(
  source: Readable,
  target: string,
  maxBytes: number,
): Promise<{ bytes: number; sha256: string }> {
  const meter = new MeteredHash(maxBytes)
  await pipeline(source, meter, createWriteStream(target))
  return { bytes: meter.bytes, sha256: meter.digest() }
}

/** 依次拼接多个文件到 target，返回总字节数与 SHA-256。 */
export async function concatWithHash(
  sources: string[],
  target: string,
): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash("sha256")
  let bytes = 0
  const output = createWriteStream(target)

  async function* chunks() {
    for (const path of sources) {
      for await (const chunk of createReadStream(path)) {
        const buffer = chunk as Buffer
        bytes += buffer.length
        hash.update(buffer)
        yield buffer
      }
    }
  }

  await pipeline(Readable.from(chunks()), output)
  return { bytes, sha256: hash.digest("hex") }
}
