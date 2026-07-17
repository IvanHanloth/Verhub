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

import { ActionsController } from "../../actions/actions.controller"
import { AnnouncementsController } from "../../announcements/announcements.controller"
import { AnnouncementsCompatController } from "../../announcements/announcements-compat.controller"
import { AnnouncementsStatsController } from "../../announcements/announcements-stats.controller"
import { FeedbacksController } from "../../feedbacks/feedbacks.controller"
import { FeedbacksCompatController } from "../../feedbacks/feedbacks-compat.controller"
import { LogsController } from "../../logs/logs.controller"
import { ProjectsController } from "../../projects/projects.controller"
import { RequestStatsController } from "../../stats/request-stats.controller"
import { VersionsController } from "../../versions/versions.controller"
import { VersionsCompatController } from "../../versions/versions-compat.controller"
import { VersionsStatsController } from "../../versions/versions-stats.controller"

import { AdminOrApiKeyGuard } from "./admin-or-api-key.guard"
import { API_SCOPE_KEY } from "./api-scope.decorator"
import { AVAILABLE_API_SCOPES } from "../constants/api-scopes"

const CONTROLLERS = [
  ActionsController,
  AnnouncementsController,
  AnnouncementsCompatController,
  AnnouncementsStatsController,
  FeedbacksController,
  FeedbacksCompatController,
  LogsController,
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
    const mutating = adminRoutes.filter((route) => !route.id.startsWith("GET "))
    const wrongly = mutating.filter((route) => !route.scope?.endsWith(":write"))
    expect(wrongly.map((route) => `${route.id} -> ${route.scope}`)).toEqual([])
  })

  it("uses a read scope for every GET admin route", () => {
    const reads = adminRoutes.filter((route) => route.id.startsWith("GET "))
    const wrongly = reads.filter((route) => !route.scope?.endsWith(":read"))
    expect(wrongly.map((route) => `${route.id} -> ${route.scope}`)).toEqual([])
  })

  it("leaves public routes unguarded", () => {
    const guarded = publicRoutes.filter((route) => route.guards.length > 0)
    expect(guarded.map((route) => route.id)).toEqual([])
  })
})
