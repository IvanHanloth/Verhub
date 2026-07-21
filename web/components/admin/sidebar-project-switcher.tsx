"use client"

import * as React from "react"
import { FolderKanban } from "lucide-react"

import { useAdminProjects } from "@/hooks/use-admin-projects"

/**
 * 侧边栏底部的全局项目选择：选中项存在 localStorage 并广播，
 * 与项目管理页的增删改双向同步。
 */
export function SidebarProjectSwitcher() {
  const { projects, loading, error, selectedProjectKey, setSelectedProjectKey } = useAdminProjects()
  const disabled = loading || projects.length === 0

  return (
    <div className="space-y-1.5 rounded-2xl border border-slate-900/10 bg-slate-900/[0.03] p-3 dark:border-white/10 dark:bg-white/5">
      <label
        className="flex items-center gap-1.5 text-xs tracking-wide text-slate-600 uppercase dark:text-slate-400"
        htmlFor="sidebar-project-select"
      >
        <FolderKanban className="size-3.5" />
        当前项目
      </label>
      <select
        id="sidebar-project-select"
        className="w-full rounded-xl border border-slate-900/15 bg-white/80 px-3 py-2 text-sm ring-sky-300 transition outline-none focus:ring-2 disabled:opacity-60 dark:border-white/20 dark:bg-white/10"
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
      {error ? <p className="text-xs text-rose-500 dark:text-rose-300">{error}</p> : null}
      {!error && !loading && projects.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">请先在项目管理中创建项目。</p>
      ) : null}
    </div>
  )
}
