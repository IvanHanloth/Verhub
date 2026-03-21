import * as React from "react"

import { AdminCard } from "@/components/admin/admin-card"

type ProjectOption = {
  id: string
  name: string
  project_key: string
}

type ProjectSelectorCardProps = {
  selectId: string
  selectedProjectKey: string
  projects: ProjectOption[]
  disabled?: boolean
  ringClassName?: string
  onChange: (projectKey: string) => void
  warning?: React.ReactNode
}

export function ProjectSelectorCard({
  selectId,
  selectedProjectKey,
  projects,
  disabled,
  ringClassName = "ring-cyan-300",
  onChange,
  warning,
}: ProjectSelectorCardProps) {
  return (
    <AdminCard className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">项目选择</h2>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-slate-300" htmlFor={selectId}>
          目标项目
        </label>
        <select
          id={selectId}
          className={`w-full rounded-xl border border-white/20 bg-white/8 px-3 py-2 text-sm transition outline-none focus:ring-2 ${ringClassName}`}
          value={selectedProjectKey}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        >
          {projects.length === 0 ? <option value="">暂无可选项目</option> : null}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} ({project.project_key})
            </option>
          ))}
        </select>
      </div>

      {warning ? <div className="text-sm text-rose-300">{warning}</div> : null}
    </AdminCard>
  )
}
