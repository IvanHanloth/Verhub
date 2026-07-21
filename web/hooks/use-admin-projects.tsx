"use client"

import * as React from "react"

import { isAuthError } from "@/lib/api-client"
import { getSessionToken } from "@/lib/auth-session"
import { getErrorMessage } from "@/lib/error-utils"
import { listProjects, type ProjectItem } from "@/lib/projects-api"

import { useSharedProjectSelection } from "./use-shared-project-selection"

const PROJECT_PAGE_SIZE = 100

/** 项目管理里增删改后广播，让侧边栏与其他页面的项目列表立即跟上。 */
const PROJECTS_CHANGED_EVENT = "verhub.admin.projects.changed"

export function notifyAdminProjectsChanged() {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT))
}

export type AdminProjectsValue = {
  projects: ProjectItem[]
  loading: boolean
  /** 加载项目列表失败（含登录过期）时的提示文案。 */
  error: string | null
  hasToken: boolean
  selectedProjectKey: string
  selectedProject: ProjectItem | null
  setSelectedProjectKey: (projectKey: string) => void
  refresh: () => Promise<void>
}

const AdminProjectsContext = React.createContext<AdminProjectsValue | null>(null)

function useAdminProjectsState(enabled: boolean): AdminProjectsValue {
  const [token, setToken] = React.useState(() => getSessionToken().trim())
  const [projects, setProjects] = React.useState<ProjectItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const { selectedProjectKey, setSelectedProjectKey } = useSharedProjectSelection()

  // 自动补选第一个项目时要读到最新的选中值，但又不能让 refresh 依赖它，
  // 否则每次切项目都会重新拉一遍列表。
  const selectedKeyRef = React.useRef(selectedProjectKey)
  selectedKeyRef.current = selectedProjectKey

  const refresh = React.useCallback(async () => {
    if (!enabled) {
      return
    }

    const currentToken = getSessionToken().trim()
    setToken(currentToken)

    if (!currentToken) {
      setProjects([])
      setSelectedProjectKey("")
      return
    }

    setLoading(true)
    try {
      const response = await listProjects(currentToken, {
        limit: PROJECT_PAGE_SIZE,
        offset: 0,
      })
      setProjects(response.data)
      setError(null)

      const stillExists = response.data.some(
        (project) => project.project_key === selectedKeyRef.current,
      )
      if (!stillExists) {
        setSelectedProjectKey(response.data[0]?.project_key ?? "")
      }
    } catch (loadError) {
      if (isAuthError(loadError)) {
        setToken("")
        setError("登录状态已过期，请重新登录。")
      } else {
        setError(getErrorMessage(loadError))
      }

      setProjects([])
      setSelectedProjectKey("")
    } finally {
      setLoading(false)
    }
  }, [enabled, setSelectedProjectKey])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return
    }

    const onChanged = () => {
      void refresh()
    }

    window.addEventListener(PROJECTS_CHANGED_EVENT, onChanged)
    return () => {
      window.removeEventListener(PROJECTS_CHANGED_EVENT, onChanged)
    }
  }, [enabled, refresh])

  const selectedProject = React.useMemo(
    () => projects.find((project) => project.project_key === selectedProjectKey) ?? null,
    [projects, selectedProjectKey],
  )

  return {
    projects,
    loading,
    error,
    hasToken: token.trim().length > 0,
    selectedProjectKey,
    selectedProject,
    setSelectedProjectKey,
    refresh,
  }
}

export function AdminProjectsProvider({ children }: { children: React.ReactNode }) {
  const value = useAdminProjectsState(true)

  return <AdminProjectsContext.Provider value={value}>{children}</AdminProjectsContext.Provider>
}

/**
 * 后台各页共享的项目列表与选中项。有 Provider 时直接复用侧边栏的那一份，
 * 没有时（例如单测里单独渲染某个面板）退化成组件内自取，行为一致。
 */
export function useAdminProjects(): AdminProjectsValue {
  const shared = React.useContext(AdminProjectsContext)
  const standalone = useAdminProjectsState(shared === null)

  return shared ?? standalone
}
