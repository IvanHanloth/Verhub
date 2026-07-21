"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import type { ApiEndpointDoc } from "@/lib/api-docs/types"

import { TryItOut, type TryItOutInitialValues } from "./try-it-out"

type Props = {
  doc: ApiEndpointDoc
}

/**
 * 文档详情页的在线调试面板。
 *
 * 从查询串读取预填值（`path.<name>` / `query.<name>` / `token` / `body`），
 * 管理端的接口链接靠这些参数把项目上下文带进调试面板。
 */
export function DocTryItOut({ doc }: Props) {
  const searchParams = useSearchParams()

  const initialValues = React.useMemo<TryItOutInitialValues>(() => {
    const pathParams: Record<string, string> = {}
    const queryParams: Record<string, string> = {}

    for (const param of doc.pathParams) {
      const value = searchParams.get(`path.${param.name}`)
      if (value !== null) {
        pathParams[param.name] = value
      }
    }

    for (const param of doc.queryParams) {
      const value = searchParams.get(`query.${param.name}`)
      if (value !== null) {
        queryParams[param.name] = value
      }
    }

    return {
      pathParams,
      queryParams,
      token: searchParams.get("token") ?? undefined,
      body: searchParams.get("body") ?? undefined,
    }
  }, [doc.pathParams, doc.queryParams, searchParams])

  return <TryItOut doc={doc} initialValues={initialValues} />
}
