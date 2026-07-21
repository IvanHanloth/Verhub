/**
 * Architecture test: verhub.openapi.yaml must describe exactly the routes Nest registers.
 *
 * The contract file is hand-maintained and is now the single source for the
 * in-app /doc site and the admin API drawer, so a route that never makes it
 * into the yaml is invisible to every consumer — including the SDKs generated
 * from it. This fails the moment the two drift in either direction.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { RequestMethod } from "@nestjs/common"
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants"
import { parse } from "yaml"

import { ActionsController } from "./actions/actions.controller"
import { AnnouncementsCompatController } from "./announcements/announcements-compat.controller"
import { AnnouncementsPublicController } from "./announcements/announcements-public.controller"
import { AnnouncementsStatsController } from "./announcements/announcements-stats.controller"
import { AnnouncementsController } from "./announcements/announcements.controller"
import { AuthController } from "./auth/auth.controller"
import { FeedbacksCompatController } from "./feedbacks/feedbacks-compat.controller"
import { FeedbacksController } from "./feedbacks/feedbacks.controller"
import { HealthController } from "./health/health.controller"
import { LogsController } from "./logs/logs.controller"
import { ProjectsPublicController } from "./projects/projects-public.controller"
import { ProjectsController } from "./projects/projects.controller"
import { RequestStatsController } from "./stats/request-stats.controller"
import { VersionsCompatController } from "./versions/versions-compat.controller"
import { VersionsPublicController } from "./versions/versions-public.controller"
import { VersionsStatsController } from "./versions/versions-stats.controller"
import { VersionsController } from "./versions/versions.controller"
import { GithubWebhookController } from "./webhooks/github-webhook.controller"
import { GithubWebhookSecretController } from "./webhooks/github-webhook-secret.controller"

const CONTROLLERS = [
  ActionsController,
  AnnouncementsCompatController,
  AnnouncementsController,
  AnnouncementsPublicController,
  AnnouncementsStatsController,
  AuthController,
  FeedbacksCompatController,
  FeedbacksController,
  GithubWebhookController,
  GithubWebhookSecretController,
  HealthController,
  LogsController,
  ProjectsController,
  ProjectsPublicController,
  RequestStatsController,
  VersionsCompatController,
  VersionsController,
  VersionsPublicController,
  VersionsStatsController,
]

const OPENAPI_PATH = resolve(__dirname, "../../../verhub.openapi.yaml")
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"]

type OpenApiDocument = {
  paths: Record<string, Record<string, unknown>>
}

/** `:projectKey` → `{projectKey}`，把 Nest 的路径参数写法归一到 OpenAPI 写法。 */
function toOpenApiPath(path: string): string {
  const normalized = path
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .replace(/:([A-Za-z0-9_]+)/g, "{$1}")

  return normalized.startsWith("/") ? normalized : `/${normalized}`
}

function collectRoutes(controller: new (...args: never[]) => object): string[] {
  const basePath = (Reflect.getMetadata(PATH_METADATA, controller) as string) ?? ""
  const prototype = controller.prototype as Record<string, unknown>

  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== "constructor")
    .map((name) => prototype[name])
    .filter((handler): handler is (...args: unknown[]) => unknown => typeof handler === "function")
    .filter((handler) => Reflect.hasMetadata(PATH_METADATA, handler))
    .map((handler) => {
      const routePath = (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? ""
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number
      const verb = (RequestMethod[method] ?? String(method)).toLowerCase()

      return `${verb} ${toOpenApiPath(`${basePath}/${routePath}`)}`
    })
}

function collectContractRoutes(): string[] {
  const document = parse(readFileSync(OPENAPI_PATH, "utf8")) as OpenApiDocument

  return Object.entries(document.paths).flatMap(([path, pathItem]) =>
    Object.keys(pathItem)
      .filter((key) => HTTP_METHODS.includes(key))
      .map((method) => `${method} ${path}`),
  )
}

describe("openapi contract coverage", () => {
  const nestRoutes = CONTROLLERS.flatMap((controller) => collectRoutes(controller)).sort()
  const contractRoutes = collectContractRoutes().sort()

  it("finds the routes to compare", () => {
    // Guards against the whole file passing silently if reflection or parsing breaks.
    expect(nestRoutes.length).toBeGreaterThan(60)
    expect(contractRoutes.length).toBeGreaterThan(60)
  })

  it("registers no route that verhub.openapi.yaml is missing", () => {
    const missing = nestRoutes.filter((route) => !contractRoutes.includes(route))

    expect(missing).toEqual([])
  })

  it("documents no route that Nest does not register", () => {
    const stale = contractRoutes.filter((route) => !nestRoutes.includes(route))

    expect(stale).toEqual([])
  })

  it("declares unique operations", () => {
    expect(new Set(contractRoutes).size).toBe(contractRoutes.length)
  })
})
