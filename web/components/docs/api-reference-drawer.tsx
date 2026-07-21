"use client"

import * as React from "react"
import Link from "next/link"
import { BookOpen, ExternalLink } from "lucide-react"

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"

import type { ApiEndpointDoc } from "@/lib/api-docs/types"
import { listApiEndpointDocsByTag } from "@/lib/api-docs/registry"
import { toApiDocDisplayPath } from "@/lib/api-docs/utils"
import { getSessionToken } from "@/lib/auth-session"

import { ApiEndpointOverview } from "./api-endpoint-overview"
import { ApiMethodBadge } from "./api-method-badge"
import { TryItOut, type TryItOutInitialValues } from "./try-it-out"

type Props = {
  /** OpenAPI tag，决定弹窗收录哪些接口。 */
  tag: string
  title: string
  /** 当前页选中的项目，用于预填 projectKey 路径参数。 */
  projectKey?: string
  triggerClassName?: string
}

// 公开接口在前：客户端接入时先看这一组；webhook 是第三方回调，排在最后。
const VISIBILITY_ORDER: Record<ApiEndpointDoc["visibility"], number> = {
  public: 0,
  admin: 1,
  webhook: 2,
}

function sortDocs(docs: ApiEndpointDoc[]): ApiEndpointDoc[] {
  return [...docs].sort((left, right) => {
    if (left.visibility !== right.visibility) {
      return VISIBILITY_ORDER[left.visibility] - VISIBILITY_ORDER[right.visibility]
    }

    return left.path.localeCompare(right.path)
  })
}

export function ApiReferenceDrawer({ tag, title, projectKey, triggerClassName }: Props) {
  const docs = React.useMemo(() => sortDocs(listApiEndpointDocsByTag(tag)), [tag])
  const [open, setOpen] = React.useState(false)
  const [activeSlug, setActiveSlug] = React.useState(() => docs[0]?.slug ?? "")
  const [token, setToken] = React.useState("")

  // 管理端已登录，打开时把会话令牌带进调试面板，省去手工粘贴。
  React.useEffect(() => {
    if (open) {
      setToken(getSessionToken())
    }
  }, [open])

  const activeDoc = docs.find((item) => item.slug === activeSlug) ?? docs[0]

  const initialValues = React.useMemo<TryItOutInitialValues>(
    () => ({
      pathParams: projectKey ? { projectKey } : ({} as Record<string, string>),
      token,
    }),
    [projectKey, token],
  )

  if (!docs.length) {
    return null
  }

  const groups = [
    { label: "公开接口", items: docs.filter((item) => item.visibility === "public") },
    { label: "管理接口", items: docs.filter((item) => item.visibility === "admin") },
    { label: "Webhook 接口", items: docs.filter((item) => item.visibility === "webhook") },
  ].filter((group) => group.items.length)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={
          triggerClassName ??
          "inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-cyan-200/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-200/20"
        }
      >
        <BookOpen className="size-4" />
        接口文档
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full max-w-[min(1100px,95vw)] bg-slate-50 text-slate-900 sm:max-w-[min(1100px,95vw)] dark:bg-slate-950 dark:text-slate-100"
      >
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          <SheetDescription>
            接口定义来自 verhub.openapi.yaml，与 API 契约同源。下方可直接发起真实请求联调。
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="-mr-2 pr-2">
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <nav aria-label="接口列表" className="space-y-4 lg:sticky lg:top-0 lg:self-start">
              {groups.map((group) => (
                <section key={group.label} className="space-y-1.5">
                  <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    {group.label}
                  </p>
                  {group.items.map((doc) => {
                    const active = doc.slug === activeDoc?.slug

                    return (
                      <button
                        key={doc.slug}
                        type="button"
                        onClick={() => setActiveSlug(doc.slug)}
                        className={`block w-full rounded-xl border px-3 py-2 text-left transition ${
                          active
                            ? "border-sky-500/60 bg-sky-50 dark:border-sky-400/50 dark:bg-sky-500/15"
                            : "border-slate-200 bg-white hover:border-sky-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-sky-400/40"
                        }`}
                      >
                        <span className="mb-1 flex items-center gap-2">
                          <ApiMethodBadge method={doc.method} />
                          <span className="line-clamp-1 text-sm font-medium">{doc.title}</span>
                        </span>
                        <span className="line-clamp-1 block font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {toApiDocDisplayPath(doc.path)}
                        </span>
                      </button>
                    )
                  })}
                </section>
              ))}
            </nav>

            {activeDoc ? (
              <div className="min-w-0 space-y-4">
                <ApiEndpointOverview doc={activeDoc} headingLevel="h2" />
                <TryItOut doc={activeDoc} initialValues={initialValues} />
                <Link
                  href={`/doc/${activeDoc.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 text-sm text-sky-700 hover:underline dark:text-sky-300"
                >
                  在文档站打开
                  <ExternalLink className="size-3.5" />
                </Link>
              </div>
            ) : null}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
