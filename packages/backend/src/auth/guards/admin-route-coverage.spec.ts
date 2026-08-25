/**
 * Architecture test: every admin route must accept both credentials.
 *
 * Admin JWT and API key are meant to be interchangeable on admin endpoints, so
 * a route guarded by AdminOrApiKeyGuard must also declare a scope — the guard
 * fails closed without one, which would silently make the route JWT-only.
 * Conversely a route with a scope but no guard would never check it.
 *
 * This fails on any new admin route that forgets either half, rather than
 * waiting for someone to notice their API key gets a 401.
 */

import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from "@nestjs/common/constants"
import { RequestMethod } from "@nestjs/common"

import { AnnouncementsController } from "../../announcements/announcements.controller"
import { AnnouncementsCompatController } from "../../announcements/announcements-compat.controller"
import { AnnouncementsStatsController } from "../../announcements/announcements-stats.controller"
import { EventsAdminController } from "../../events/events-admin.controller"
import { FeedbacksController } from "../../feedbacks/feedbacks.controller"
import { FeedbacksCompatController } from "../../feedbacks/feedbacks-compat.controller"
import { ProjectGithubIntegrationController } from "../../github-app/project-github-integration.controller"
import { LogsController } from "../../logs/logs.controller"
import { ProjectsController } from "../../projects/projects.controller"
import { RequestStatsController } from "../../stats/request-stats.controller"
import { VersionsController } from "../../versions/versions.controller"
import { VersionsCompatController } from "../../versions/versions-compat.controller"
import { VersionsStatsController } from "../../versions/versions-stats.controller"
import { GithubWebhookSecretController } from "../../webhooks/github-webhook-secret.controller"

import { AdminOrApiKeyGuard } from "./admin-or-api-key.guard"
import { API_SCOPE_KEY } from "./api-scope.decorator"
import { AVAILABLE_API_SCOPES } from "../constants/api-scopes"

const CONTROLLERS = [
  AnnouncementsController,
  AnnouncementsCompatController,
  AnnouncementsStatsController,
  EventsAdminController,
  FeedbacksController,
  FeedbacksCompatController,
  GithubWebhookSecretController,
  LogsController,
  ProjectGithubIntegrationController,
  ProjectsController,
  RequestStatsController,
  VersionsController,
  VersionsCompatController,
  VersionsStatsController,
]

type Route = {
  id: string
  path: string
  guards: unknown[]
  scope: string | undefined
}

function methodName(method: number): string {
  return RequestMethod[method] ?? String(method)
}

function collectRoutes(controller: new (...args: never[]) => object): Route[] {
  const basePath = (Reflect.getMetadata(PATH_METADATA, controller) as string) ?? ""
  const classGuards = (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? []
  const prototype = controller.prototype as Record<string, unknown>

  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== "constructor")
    .map((name) => prototype[name])
    .filter((handler): handler is (...args: unknown[]) => unknown => typeof handler === "function")
    .filter((handler) => Reflect.hasMetadata(PATH_METADATA, handler))
    .map((handler) => {
      const routePath = (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? ""
      const verb = methodName(Reflect.getMetadata(METHOD_METADATA, handler) as number)
      const methodGuards = (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? []
      const fullPath = `${basePath}/${routePath}`.replace(/\/+/g, "/").replace(/\/$/, "")

      return {
        id: `${verb} /${fullPath.replace(/^\//, "")}`,
        path: fullPath,
        guards: [...classGuards, ...methodGuards],
        scope: Reflect.getMetadata(API_SCOPE_KEY, handler) as string | undefined,
      }
    })
}

/**
 * 用 POST 但不改任何状态的 admin 路由。
 *
 * 规则的本意是「改状态的要 :write」，而这几条用 POST 只是因为入参是结构化数组
 * （漏斗步骤、指标 DSL），塞进 query string 既超长又要自己发明一套编码。给它们
 * :write 会让只读的 API Key 做不了分析，那才是真的错。
 *
 * 加进这个集合前先确认：该路由确实不写库。
 */
const READ_ONLY_POST_ROUTES = new Set([
  "POST /admin/projects/:projectKey/events/analysis/funnel",
  "POST /admin/projects/:projectKey/events/analysis/retention",
  "POST /admin/projects/:projectKey/events/analysis/paths",
  "POST /admin/projects/:projectKey/events/analysis/query",
])

const allRoutes = CONTROLLERS.flatMap((controller) => collectRoutes(controller))
const adminRoutes = allRoutes.filter((route) => route.path.startsWith("admin"))
const publicRoutes = allRoutes.filter((route) => route.path.startsWith("public"))

describe("admin route credential coverage", () => {
  it("finds the admin routes to check", () => {
    // Guards against this whole file silently passing if reflection breaks.
    expect(adminRoutes.length).toBeGreaterThan(25)
  })

  it.each(adminRoutes.map((route) => [route.id, route]))(
    "%s accepts both an admin JWT and an API key",
    (_id, route) => {
      expect((route as Route).guards).toContain(AdminOrApiKeyGuard)
    },
  )

  it.each(adminRoutes.map((route) => [route.id, route]))(
    "%s declares a known API scope",
    (_id, route) => {
      const { scope } = route as Route
      expect(scope).toBeDefined()
      expect(AVAILABLE_API_SCOPES).toContain(scope)
    },
  )

  it("uses a write scope for every mutating admin route", () => {
    const mutating = adminRoutes.filter(
      (route) => !route.id.startsWith("GET ") && !READ_ONLY_POST_ROUTES.has(route.id),
    )
    const wrongly = mutating.filter((route) => !route.scope?.endsWith(":write"))
    expect(wrongly.map((route) => `${route.id} -> ${route.scope}`)).toEqual([])
  })

  it("uses a read scope for every GET admin route", () => {
    const reads = adminRoutes.filter(
      (route) => route.id.startsWith("GET ") || READ_ONLY_POST_ROUTES.has(route.id),
    )
    const wrongly = reads.filter((route) => !route.scope?.endsWith(":read"))
    expect(wrongly.map((route) => `${route.id} -> ${route.scope}`)).toEqual([])
  })

  it("keeps the read-only POST exception list from going stale", () => {
    // 例外集合里的路由必须真的存在，否则改了路径之后这里会静默地放行一条新路由。
    const known = new Set(adminRoutes.map((route) => route.id))
    const missing = [...READ_ONLY_POST_ROUTES].filter((id) => !known.has(id))
    expect(missing).toEqual([])
  })

  it("leaves public routes unguarded", () => {
    const guarded = publicRoutes.filter((route) => route.guards.length > 0)
    expect(guarded.map((route) => route.id)).toEqual([])
  })
})
