import "reflect-metadata"
import { ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"

import { AppModule } from "./app.module"

async function bootstrap(): Promise<void> {
  // rawBody keeps the untouched request bytes on `req.rawBody`. The GitHub
  // webhook signs those exact bytes, and re-serializing the parsed JSON would
  // change key order and whitespace, so the HMAC would never match.
  const app = await NestFactory.create(AppModule, { rawBody: true })

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
