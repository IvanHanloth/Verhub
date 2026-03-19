import "reflect-metadata"
import { ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"

import { AppModule } from "./app.module"

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  const corsOrigin = process.env.CORS_ORIGIN
  const origins = corsOrigin
    ? corsOrigin
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : true

  app.enableCors({
    origin: origins,
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
