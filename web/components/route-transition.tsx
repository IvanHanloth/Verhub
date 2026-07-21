"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

type Props = {
  children: React.ReactNode
  className?: string
}

/** 整页加载的首屏直出可见，只有客户端软导航才播动画。 */
let routedOnce = false

/**
 * 路由切换的淡入上移动画。
 * 静止态不保留 translate：位移属性会为 sticky / fixed 子元素创建新的包含块。
 */
export function RouteTransition({ children, className }: Props) {
  const pathname = usePathname()
  const [settled, setSettled] = React.useState(() => !routedOnce)
  const skipRef = React.useRef(!routedOnce)

  React.useEffect(() => {
    routedOnce = true

    if (skipRef.current) {
      skipRef.current = false
      return
    }

    setSettled(false)
    const timer = window.setTimeout(() => setSettled(true), 10)

    return () => {
      window.clearTimeout(timer)
    }
  }, [pathname])

  return (
    <div
      className={cn(
        "transition-[opacity,translate] duration-300 ease-out motion-reduce:transition-none",
        settled ? "opacity-100" : "translate-y-1 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  )
}
