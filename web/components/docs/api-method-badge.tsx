import type { HttpMethod } from "@/lib/api-docs/types"

const methodColorMap: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  POST: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  PATCH: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PUT: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  DELETE: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
}

export function ApiMethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ${methodColorMap[method]}`}
    >
      {method}
    </span>
  )
}
