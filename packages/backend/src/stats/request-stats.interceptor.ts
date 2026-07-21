import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { PublicEndpoint } from "@prisma/client"
import type { Request } from "express"
import { Observable, tap } from "rxjs"

import { PLATFORM_HEADER, resolvePlatform } from "./platform-detection"
import { RequestStatsService } from "./request-stats.service"
import { TRACK_ENDPOINT_KEY } from "./track-endpoint.decorator"

type TrackedRequest = Request<{ projectKey?: string }> & {
  body?: { platform?: unknown; current_version?: unknown; current_comparable_version?: unknown }
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
        const platform = resolvePlatform(
          this.declaredPlatform(request),
          request.headers["user-agent"],
        )

        this.requestStatsService.recordRequestSafely({ projectKey, endpoint, platform })

        // check-update is the one public route where the client tells us which
        // version it is running, so it is the only place field-version share
        // can be measured.
        if (endpoint === PublicEndpoint.VERSION_CHECK_UPDATE) {
          const version = this.reportedVersion(request)
          if (version) {
            this.requestStatsService.recordClientVersionSafely({ projectKey, version, platform })
          }
        }
      }),
    )
  }

  /** An SDK may declare its platform via header, query param, or request body. */
  private declaredPlatform(request: TrackedRequest): unknown {
    return request.headers[PLATFORM_HEADER] ?? request.query?.platform ?? request.body?.platform
  }

  /**
   * The client's own version string. `current_version` is the display version
   * an operator recognizes; `current_comparable_version` is only the ordering
   * key, so it is a fallback for SDKs that send nothing else.
   */
  private reportedVersion(request: TrackedRequest): string | null {
    const reported = request.body?.current_version ?? request.body?.current_comparable_version
    if (typeof reported !== "string") {
      return null
    }

    const trimmed = reported.trim()
    return trimmed || null
  }
}
