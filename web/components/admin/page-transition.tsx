"use client"

import * as React from "react"

type Props = {
  children: React.ReactNode
  routeKey: string
}

export function PageTransition({ children, routeKey }: Props) {
  const [active, setActive] = React.useState(false)

  React.useEffect(() => {
    setActive(false)
    const timer = window.setTimeout(() => setActive(true), 10)

    return () => {
      window.clearTimeout(timer)
    }
  }, [routeKey])

  return (
    <div
      className={`transition-all duration-300 ease-out ${active ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}
    >
      {children}
    </div>
  )
}
