"use client"

import * as React from "react"
import { ChevronsUpDown, FolderKanban } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { useAdminProjects } from "@/hooks/use-admin-projects"

type Props = {
  className?: string
}

/**
 * 侧边栏底部的全局项目选择：选中项存在 localStorage 并广播，
 * 与项目管理页的增删改双向同步。
 * 尺寸与同行 icon 按钮对齐（h-8 / rounded-lg）。
 */
export function SidebarProjectSwitcher({ className }: Props) {
  const { projects, loading, error, selectedProjectKey, setSelectedProjectKey } = useAdminProjects()
  const disabled = loading || projects.length === 0
  const hint = error ?? (!loading && projects.length === 0 ? "请先在项目管理中创建项目。" : null)

  return (
    <div className={cn("min-w-0", className)}>
      <div className="relative">
        <FolderKanban className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
        <select
          id="sidebar-project-select"
          aria-label="当前项目"
          title={hint ?? "当前项目"}
          className={cn(
            "h-8 w-full appearance-none truncate rounded-lg border border-slate-900/15 bg-white/80 pr-7 pl-8 text-sm ring-sky-300 transition outline-none focus:ring-2 disabled:opacity-60 dark:border-white/20 dark:bg-white/10",
            error ? "border-rose-400/60 dark:border-rose-400/50" : null,
          )}
          value={selectedProjectKey}
          onChange={(event) => setSelectedProjectKey(event.target.value)}
          disabled={disabled}
        >
          {projects.length === 0 ? (
            <option value="">{loading ? "正在加载..." : "暂无可选项目"}</option>
          ) : null}
          {projects.map((project) => (
            <option key={project.project_key} value={project.project_key}>
              {project.name}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
      </div>
      {hint ? (
        <p
          className={cn(
            "mt-1 text-[11px] leading-tight",
            error ? "text-rose-500 dark:text-rose-300" : "text-slate-500 dark:text-slate-400",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}
