"use client"

import * as React from "react"

const STORAGE_KEY = "verhub.admin.selectedProjectKey"
const EVENT_NAME = "verhub.admin.project.changed"

function readStoredProjectKey(): string {
  if (typeof window === "undefined") {
    return ""
  }

  return window.localStorage.getItem(STORAGE_KEY)?.trim() ?? ""
}

function emitChange(nextKey: string) {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new CustomEvent<string>(EVENT_NAME, { detail: nextKey }))
}

export function useSharedProjectSelection(defaultValue = "") {
  const [selectedProjectKey, setSelectedProjectKeyState] = React.useState(() => {
    const current = readStoredProjectKey()
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

      setSelectedProjectKeyState(event.newValue?.trim() ?? "")
    }

    const onCustomChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      setSelectedProjectKeyState(detail?.trim() ?? "")
    }

    window.addEventListener("storage", onStorage)
    window.addEventListener(EVENT_NAME, onCustomChange)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(EVENT_NAME, onCustomChange)
    }
  }, [])

  const setSelectedProjectKey = React.useCallback((nextKey: string) => {
    const normalized = nextKey.trim()
    setSelectedProjectKeyState(normalized)

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
    selectedProjectKey,
    setSelectedProjectKey,
  }
}
