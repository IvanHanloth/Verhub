"use client"

import * as React from "react"

import type { ApiExampleDoc } from "@/lib/api-docs/types"

import { CodeBlock } from "./code-block"

type Props = {
  successExample: ApiExampleDoc
  errorExamples: ApiExampleDoc[]
}

export function ApiResponseTabs({ successExample, errorExamples }: Props) {
  const tabs = React.useMemo(
    () => [successExample, ...errorExamples],
    [errorExamples, successExample],
  )
  const [active, setActive] = React.useState(0)

  React.useEffect(() => {
    setActive(0)
  }, [successExample.label])

  const current = tabs[active] ?? tabs[0]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab, index) => {
          const isActive = index === active
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => setActive(index)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${isActive ? "border-sky-500 bg-sky-100 text-sky-800 dark:border-sky-400/60 dark:bg-sky-500/20 dark:text-sky-200" : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10"}`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {current ? (
        <CodeBlock title={current.label} language={current.language} content={current.content} />
      ) : null}
    </div>
  )
}
