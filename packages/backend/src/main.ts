import "reflect-metadata"
import { ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import type { NestExpressApplication } from "@nestjs/platform-express"

import { AppModule } from "./app.module"

/**
 * JSON 请求体上限。公告正文与版本更新说明都不再校验长度，这里就是唯一的兜底防线，
 * 不显式设置会落到 body-parser 默认的 100kb —— 长正文会先撞上一个没头没尾的 413。
 * 调大它的同时，前置反向代理的 client_max_body_size 也得跟着放开。
 */
const MAX_BODY_SIZE = "1mb"

async function bootstrap(): Promise<void> {
  // rawBody keeps the untouched request bytes on `req.rawBody`. The GitHub
  // webhook signs those exact bytes, and re-serializing the parsed JSON would
  // change key order and whitespace, so the HMAC would never match.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })

  // useBodyParser 会沿用上面的 rawBody 选项，重装后 webhook 验签用的原始字节仍在。
  app.useBodyParser("json", { limit: MAX_BODY_SIZE })

  app.enableCors({
    origin: true,
    credentials: true,
  })

  app.setGlobalPrefix("api/v1")
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  )

  const port = Number(process.env.PORT ?? 4000)
  await app.listen(port)
}

void bootstrap()
