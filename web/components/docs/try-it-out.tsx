"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import type { ApiEndpointDoc } from "@/lib/api-docs/types"
import { buildTryItOutUrl } from "@/lib/api-docs/utils"

import { ApiMethodBadge } from "./api-method-badge"

type Props = {
  doc: ApiEndpointDoc
}

function initializeRecord(items: { name: string; example?: string }[]) {
  return items.reduce<Record<string, string>>((acc, item) => {
    acc[item.name] = item.example ?? ""
    return acc
  }, {})
}

export function TryItOut({ doc }: Props) {
  const searchParams = useSearchParams()
  const [pathValues, setPathValues] = React.useState<Record<string, string>>(() =>
    initializeRecord(doc.pathParams),
  )
  const [queryValues, setQueryValues] = React.useState<Record<string, string>>(() =>
    initializeRecord(doc.queryParams),
  )
  const [token, setToken] = React.useState("")
  const [bodyText, setBodyText] = React.useState(doc.requestBody?.content ?? "")
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<{ status: number; body: string } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const nextPathValues = initializeRecord(doc.pathParams)
    const nextQueryValues = initializeRecord(doc.queryParams)

    for (const param of doc.pathParams) {
      const value = searchParams.get(`path.${param.name}`)
      if (value !== null) {
        nextPathValues[param.name] = value
      }
    }

    for (const param of doc.queryParams) {
      const value = searchParams.get(`query.${param.name}`)
      if (value !== null) {
        nextQueryValues[param.name] = value
      }
    }

    const tokenFromUrl = searchParams.get("token")
    const bodyFromUrl = searchParams.get("body")

    setPathValues(nextPathValues)
    setQueryValues(nextQueryValues)
    setToken(doc.auth.mode === "none" ? "" : (tokenFromUrl ?? ""))

    if (doc.requestBody) {
      setBodyText(bodyFromUrl ?? doc.requestBody.content)
    } else {
      setBodyText("")
    }
  }, [doc.auth.mode, doc.path, doc.pathParams, doc.queryParams, doc.requestBody, searchParams])

  const previewUrl = React.useMemo(
    () => buildTryItOutUrl(doc.path, pathValues, queryValues),
    [doc.path, pathValues, queryValues],
  )

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setSubmitting(true)
    setError(null)
    setResult(null)

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      }
      if (doc.auth.mode !== "none" && token.trim()) {
        headers.Authorization = `Bearer ${token.trim()}`
      }

      const init: RequestInit = {
        method: doc.method,
        headers,
      }

      if (doc.method !== "GET" && doc.method !== "DELETE") {
        const trimmed = bodyText.trim()
        if (trimmed) {
          init.body = JSON.stringify(JSON.parse(trimmed))
        }
      }

      const response = await fetch(previewUrl, init)
      const raw = await response.text()
      const contentType = response.headers.get("content-type") ?? ""

      let prettyBody = raw || "<empty>"
      if (raw && contentType.includes("application/json")) {
        try {
          const parsed = JSON.parse(raw) as unknown
          prettyBody = JSON.stringify(parsed, null, 2)
        } catch {
          prettyBody = raw
        }
      }

      setResult({
        status: response.status,
        body: prettyBody,
      })
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message)
      } else {
        setError("请求失败，请检查输入参数。")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-white/10 dark:bg-black/25">
      <div className="flex items-center gap-2">
        <ApiMethodBadge method={doc.method} />
        <h3 className="text-base font-semibold">Try It Out</h3>
      </div>

      <form className="space-y-4" onSubmit={submitRequest}>
        {doc.pathParams.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {doc.pathParams.map((param) => (
              <label key={param.name} className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">{`Path: ${param.name}`}</span>
                <input
                  value={pathValues[param.name] ?? ""}
                  onChange={(event) => {
                    setPathValues((prev) => ({ ...prev, [param.name]: event.target.value }))
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900"
                />
              </label>
            ))}
          </div>
        ) : null}

        {doc.queryParams.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {doc.queryParams.map((param) => (
              <label key={param.name} className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">{`Query: ${param.name}`}</span>
                <input
                  value={queryValues[param.name] ?? ""}
                  onChange={(event) => {
                    setQueryValues((prev) => ({ ...prev, [param.name]: event.target.value }))
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900"
                />
              </label>
            ))}
          </div>
        ) : null}

        {doc.auth.mode !== "none" ? (
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Token</span>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="输入 Bearer Token"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900"
            />
          </label>
        ) : null}

        {doc.requestBody ? (
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              Request Body (JSON)
            </span>
            <textarea
              value={bodyText}
              onChange={(event) => setBodyText(event.target.value)}
              rows={8}
              className="w-full rounded-lg border border-slate-300 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 dark:border-white/15"
            />
          </label>
        ) : null}

        <div className="space-y-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs dark:border-white/15">
          <p className="font-semibold text-slate-600 dark:text-slate-300">请求 URL 预览</p>
          <code className="block text-[11px] break-all text-slate-700 dark:text-slate-100">
            {previewUrl}
          </code>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "请求中..." : "发送请求"}
        </button>
      </form>

      {error ? (
        <p className="rounded-lg border border-rose-300/60 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-900/20 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{`响应状态：${result.status}`}</p>
          <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100 dark:border-white/10">
            <code>{result.body}</code>
          </pre>
        </div>
      ) : null}
    </section>
  )
}
