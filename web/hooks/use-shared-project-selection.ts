"use client"

import * as React from "react"

const STORAGE_KEY = "verhub.admin.selectedProjectId"
const EVENT_NAME = "verhub.admin.project.changed"

function readStoredProjectId(): string {
  if (typeof window === "undefined") {
    return ""
  }

  return window.localStorage.getItem(STORAGE_KEY)?.trim() ?? ""
}

function emitChange(nextId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new CustomEvent<string>(EVENT_NAME, { detail: nextId }))
}

export function useSharedProjectSelection(defaultValue = "") {
  const [selectedProjectId, setSelectedProjectIdState] = React.useState(() => {
    const current = readStoredProjectId()
    return current || defaultValue
  })

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) {
        return
      }

      setSelectedProjectIdState(event.newValue?.trim() ?? "")
    }

    const onCustomChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      setSelectedProjectIdState(detail?.trim() ?? "")
    }

    window.addEventListener("storage", onStorage)
    window.addEventListener(EVENT_NAME, onCustomChange)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(EVENT_NAME, onCustomChange)
    }
  }, [])

  const setSelectedProjectId = React.useCallback((nextId: string) => {
    const normalized = nextId.trim()
    setSelectedProjectIdState(normalized)

    if (typeof window === "undefined") {
      return
    }

    if (normalized) {
      window.localStorage.setItem(STORAGE_KEY, normalized)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }

    emitChange(normalized)
  }, [])

  return {
    selectedProjectId,
    setSelectedProjectId,
  }
}
