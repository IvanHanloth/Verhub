import { AdminItemCard } from "@/components/admin/admin-card"

type ApiEndpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE"
  path: string
  description: string
  auth?: {
    tokenRequired: boolean
    tokenType?: string
    scopes?: string[]
  }
  requestBody?: Record<string, unknown>
}

type ApiGroup = {
  label: string
  endpoints: ApiEndpoint[]
}

type ProjectApiOverviewProps = {
  title: string
  projectKey?: string
  groups: ApiGroup[]
}

const METHOD_CLASS: Record<ApiEndpoint["method"], string> = {
  GET: "border-sky-300/50 bg-sky-300/15 text-sky-700 dark:text-sky-200",
  POST: "border-emerald-300/50 bg-emerald-300/15 text-emerald-700 dark:text-emerald-200",
  PATCH: "border-amber-300/50 bg-amber-300/15 text-amber-700 dark:text-amber-200",
  DELETE: "border-rose-300/50 bg-rose-300/15 text-rose-700 dark:text-rose-200",
}

function replacePathVars(path: string, projectKey?: string): string {
  return path.replaceAll("{projectKey}", projectKey || "<projectKey>")
}

function replaceBodyVars(value: unknown, projectKey?: string): unknown {
  if (typeof value === "string") {
    return value.replaceAll("{projectKey}", projectKey || "<projectKey>")
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceBodyVars(item, projectKey))
  }

  if (!value || typeof value !== "object") {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, replaceBodyVars(child, projectKey)]),
  )
}

export function ProjectApiOverview({ title, projectKey, groups }: ProjectApiOverviewProps) {
  return (
    <AdminItemCard className="border-slate-900/10 bg-white/70 p-4 dark:border-white/15 dark:bg-white/5">
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
      <div className="mt-3 space-y-3">
        {groups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-300">
              {group.label}
            </p>
            {group.endpoints.map((endpoint) => {
              const endpointPath = replacePathVars(endpoint.path, projectKey)
              const requestBody = endpoint.requestBody
                ? replaceBodyVars(endpoint.requestBody, projectKey)
                : undefined

              return (
                <details
                  key={`${group.label}:${endpoint.method}:${endpoint.path}`}
                  className="rounded-xl border border-slate-900/10 bg-white/80 px-3 py-2 text-xs dark:border-white/10 dark:bg-black/20"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 font-semibold ${METHOD_CLASS[endpoint.method]}`}
                    >
                      {endpoint.method}
                    </span>
                    <code className="text-slate-700 dark:text-slate-200">{endpointPath}</code>
                  </summary>

                  <div className="mt-2 space-y-2">
                    <p className="text-slate-600 dark:text-slate-300">{endpoint.description}</p>

                    <div className="rounded-lg border border-slate-900/10 bg-white/70 p-2 dark:border-white/10 dark:bg-black/20">
                      <p className="font-semibold text-slate-700 dark:text-slate-200">认证要求</p>
                      {endpoint.auth?.tokenRequired ? (
                        <>
                          <p className="mt-1 text-slate-600 dark:text-slate-300">
                            需要 Token: {endpoint.auth.tokenType || "Bearer Token"}
                          </p>
                          {endpoint.auth.scopes?.length ? (
                            <p className="text-slate-600 dark:text-slate-300">
                              需要权限: {endpoint.auth.scopes.join(", ")}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="mt-1 text-slate-600 dark:text-slate-300">
                          公开接口，无需 Token
                        </p>
                      )}
                    </div>

                    {requestBody ? (
                      <details className="rounded-lg border border-slate-900/10 bg-white/70 p-2 dark:border-white/10 dark:bg-black/20">
                        <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
                          请求体示例
                        </summary>
                        <pre className="mt-2 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">
                          {JSON.stringify(requestBody, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                </details>
              )
            })}
          </div>
        ))}
      </div>
    </AdminItemCard>
  )
}
