"use client"

import * as React from "react"

import { MarkdownContent } from "@/components/markdown/markdown-content"

// 折叠时用 mask 让内容自身渐隐，而不是盖一层同色渐变遮罩：展示页里同一个组件
// 会落在 hero 渐变、白卡片、页面底色三种背景上，遮罩没法同时匹配。
const FADE_MASK = "linear-gradient(to bottom, #000 55%, transparent 100%)"

/**
 * 折叠超长 Markdown。line-clamp 只作用于单个行盒，对渲染后的多个块级元素无效，
 * 因此改用 max-height 截断 + 溢出实测来决定是否给出展开入口。
 */
export function ExpandableMarkdown({
  children,
  collapsedHeight,
  className,
  bodyClassName,
}: ExpandableMarkdownProps) {
  const [expanded, setExpanded] = React.useState(false)
  const [overflowing, setOverflowing] = React.useState(false)
  const bodyRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const element = bodyRef.current
    if (!element) {
      return
    }

    let disposed = false
    const measure = () => {
      if (disposed) {
        return
      }

      // 被测元素本身不受 max-height 约束（约束在外层），因此展开态下测量依旧准确
      setOverflowing(element.scrollHeight > collapsedHeight + 1)
    }

    measure()

    // 字体替换会改变折行结果，但外层高度被钉死时 ResizeObserver 可能不触发，补测一次
    void document.fonts?.ready.then(measure)

    const observer = new ResizeObserver(measure)
    observer.observe(element)

    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [children, collapsedHeight])

  const collapsed = overflowing && !expanded

  return (
    <div className={className}>
      <div
        style={
          collapsed
            ? {
                maxHeight: collapsedHeight,
                overflow: "hidden",
                maskImage: FADE_MASK,
                WebkitMaskImage: FADE_MASK,
              }
            : undefined
        }
      >
        <div ref={bodyRef}>
          <MarkdownContent className={bodyClassName}>{children}</MarkdownContent>
        </div>
      </div>

      {overflowing ? (
        <button
          type="button"
          onClick={() => setExpanded((previous) => !previous)}
          className="mt-2 text-xs font-semibold text-[#cb5f22] hover:underline dark:text-[#ffa66f]"
        >
          {expanded ? "收起" : "展开全文"}
        </button>
      ) : null}
    </div>
  )
}

type ExpandableMarkdownProps = {
  children: string
  collapsedHeight: number
  className?: string
  bodyClassName?: string
}
