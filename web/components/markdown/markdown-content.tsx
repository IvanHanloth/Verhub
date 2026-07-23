"use client"

import * as React from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import remarkGfm from "remark-gfm"

// 公告 / 版本说明由管理员撰写但对公众展示，必须过一遍白名单清洗，
// 否则一个被攻陷的管理账号就能在展示页注入脚本。
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // GFM 任务列表会渲染 <input type="checkbox" disabled>，默认白名单不含它
    input: [...(defaultSchema.attributes?.input ?? []), "checked", "disabled", "type"],
  },
}

// 标题在卡片内出现，按站点正文比例压缩；GitHub Release 正文常以 ## 起头，
// 若沿用浏览器默认尺寸会盖过卡片自身的标题层级。
const HEADING_CLASSES = {
  1: "mt-4 mb-2 text-lg font-bold first:mt-0",
  2: "mt-4 mb-2 text-base font-bold first:mt-0",
  3: "mt-3 mb-1.5 text-[15px] font-bold first:mt-0",
  4: "mt-3 mb-1.5 text-sm font-bold first:mt-0",
  5: "mt-2 mb-1 text-sm font-semibold first:mt-0",
  6: "mt-2 mb-1 text-xs font-semibold first:mt-0",
} as const

function Heading({
  level,
  children,
}: {
  level: keyof typeof HEADING_CLASSES
  children: React.ReactNode
}) {
  const Tag = `h${level}` as const
  return <Tag className={HEADING_CLASSES[level]}>{children}</Tag>
}

const COMPONENTS: Components = {
  h1: ({ children }) => <Heading level={1}>{children}</Heading>,
  h2: ({ children }) => <Heading level={2}>{children}</Heading>,
  h3: ({ children }) => <Heading level={3}>{children}</Heading>,
  h4: ({ children }) => <Heading level={4}>{children}</Heading>,
  h5: ({ children }) => <Heading level={5}>{children}</Heading>,
  h6: ({ children }) => <Heading level={6}>{children}</Heading>,

  p: ({ children }) => <p className="my-2 leading-7 first:mt-0 last:mb-0">{children}</p>,

  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer nofollow"
      className="font-medium break-words text-[#cb5f22] underline-offset-2 hover:underline dark:text-[#ffa66f]"
    >
      {children}
    </a>
  ),

  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-7 [&>p]:my-0">{children}</li>,

  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-slate-900/20 pl-3 text-slate-500 dark:border-white/20 dark:text-slate-400">
      {children}
    </blockquote>
  ),

  // 行内 code 与代码块共用该组件，块级样式交给下面的 pre 覆盖
  code: ({ children }) => (
    <code className="rounded bg-slate-900/6 px-1.5 py-0.5 font-mono text-[0.88em] break-words dark:bg-white/10">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-slate-900/10 bg-slate-900/4 p-3 font-mono text-[13px] leading-6 first:mt-0 last:mb-0 dark:border-white/10 dark:bg-black/30 [&>code]:bg-transparent [&>code]:p-0 [&>code]:break-normal">
      {children}
    </pre>
  ),

  // 宽表格自己横向滚动，避免把整页撑出横向滚动条
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-slate-900/12 bg-slate-900/4 px-3 py-1.5 font-semibold dark:border-white/12 dark:bg-white/5">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-slate-900/12 px-3 py-1.5 dark:border-white/12">{children}</td>
  ),

  hr: () => <hr className="my-4 border-slate-900/10 dark:border-white/10" />,

  // Markdown 图片指向任意外站，next/image 需要预先登记 remotePatterns，用原生 img
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === "string" ? src : ""}
      alt={alt ?? ""}
      className="my-2 max-w-full rounded-lg"
    />
  ),

  input: ({ checked, type }) =>
    type === "checkbox" ? (
      <input type="checkbox" checked={checked} readOnly className="mr-1.5 align-middle" />
    ) : null,
}

// memo：正文内容不变时不重解析。展示页的公告轮播每 5 秒触发一次整树重渲染，
// 而版本/公告正文与轮播索引无关，浅比较即可挡掉全部无谓的 remark/rehype 解析。
export const MarkdownContent = React.memo(function MarkdownContent({
  children,
  className,
}: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, SANITIZE_SCHEMA]]}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
})

type MarkdownContentProps = {
  children: string
  className?: string
}
