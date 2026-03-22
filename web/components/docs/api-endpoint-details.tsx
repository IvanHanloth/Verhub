import type { ApiEndpointDoc } from "@/lib/api-docs/types"
import { getDefaultErrorResponses } from "@/lib/api-docs/error-examples"
import { toApiDocDisplayPath } from "@/lib/api-docs/utils"

import { ApiMethodBadge } from "./api-method-badge"
import { ApiParameterTable } from "./api-parameter-table"
import { ApiResponseTabs } from "./api-response-tabs"
import { CodeBlock } from "./code-block"
import { TryItOut } from "./try-it-out"

type Props = {
  doc: ApiEndpointDoc
}

export function ApiEndpointDetails({ doc }: Props) {
  const errorResponses = doc.errorResponses ?? getDefaultErrorResponses(doc)

  return (
    <article className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
        <header className="space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-5 dark:border-white/10 dark:bg-black/25">
          <div className="flex flex-wrap items-center gap-2">
            <ApiMethodBadge method={doc.method} />
            <span className="rounded-full border border-slate-300 px-2 py-1 text-xs text-slate-600 dark:border-white/15 dark:text-slate-300">
              {doc.visibility === "public" ? "公开接口" : "管理接口"}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{doc.title}</h1>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {doc.description}
          </p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-slate-900/60">
            <p className="mb-1 text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">
              URL
            </p>
            <code className="font-mono text-sm break-all text-slate-800 dark:text-slate-100">
              {toApiDocDisplayPath(doc.path)}
            </code>
          </div>
        </header>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-5 dark:border-white/10 dark:bg-black/25">
          <h2 className="text-lg font-semibold">鉴权方式</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{doc.auth.description}</p>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white/80 p-5 dark:border-white/10 dark:bg-black/25">
          <h2 className="text-lg font-semibold">请求参数</h2>
          <ApiParameterTable title="Path 参数" items={doc.pathParams} />
          <ApiParameterTable title="Query 参数" items={doc.queryParams} />
          <ApiParameterTable title="Header 参数" items={doc.headers} />
          {doc.requestBody ? (
            <CodeBlock
              title={doc.requestBody.label}
              language={doc.requestBody.language}
              content={doc.requestBody.content}
            />
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">该接口无需请求体。</p>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white/80 p-5 dark:border-white/10 dark:bg-black/25">
          <h2 className="text-lg font-semibold">响应示例</h2>
          <ApiResponseTabs successExample={doc.responseBody} errorExamples={errorResponses} />
        </section>
      </div>

      <div className="xl:sticky xl:top-22 xl:h-fit">
        <TryItOut doc={doc} />
      </div>
    </article>
  )
}
