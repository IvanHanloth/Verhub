import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { PublicEndpoint } from "@prisma/client"
import type { Request } from "express"
import { Observable, tap } from "rxjs"

import { PLATFORM_HEADER, resolvePlatform } from "./platform-detection"
import { RequestStatsService } from "./request-stats.service"
import { TRACK_ENDPOINT_KEY } from "./track-endpoint.decorator"

type TrackedRequest = Request<{ projectKey?: string }> & {
  body?: { platform?: unknown }
  query?: { platform?: unknown }
}

@Injectable()
export class RequestStatsInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestStatsService: RequestStatsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const endpoint = this.reflector.get<PublicEndpoint | undefined>(
      TRACK_ENDPOINT_KEY,
      context.getHandler(),
    )

    if (!endpoint) {
      return next.handle()
    }

    const request = context.switchToHttp().getRequest<TrackedRequest>()
    const projectKey = request.params?.projectKey

    if (!projectKey) {
      return next.handle()
    }

    // Recorded only on success. A failed request either has no matching project
    // row — which the ApiRequestStat foreign key would reject — or reflects a
    // client error we do not want inflating traffic counts.
    return next.handle().pipe(
      tap(() => {
        this.requestStatsService.recordRequestSafely({
          projectKey,
          endpoint,
          platform: resolvePlatform(this.declaredPlatform(request), request.headers["user-agent"]),
        })
      }),
    )
  }

  /** An SDK may declare its platform via header, query param, or request body. */
  private declaredPlatform(request: TrackedRequest): unknown {
    return request.headers[PLATFORM_HEADER] ?? request.query?.platform ?? request.body?.platform
  }
}
