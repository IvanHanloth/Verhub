import { ArrowRight, Bell, FolderKanban, ListTree, MessageSquare, ShieldAlert, ShieldCheck } from "lucide-react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

const quickLinks = [
  {
    title: "项目管理",
    description: "维护项目基础信息、仓库地址与可见范围。",
    icon: FolderKanban,
    href: "/projects",
  },
  {
    title: "版本发布",
    description: "配置下载地址、强更策略与平台差异化包。",
    icon: ListTree,
    href: "/versions",
  },
  {
    title: "公告中心",
    description: "管理置顶公告、灰度说明与版本通知。",
    icon: Bell,
    href: "/announcements",
  },
  {
    title: "反馈工作台",
    description: "聚合用户反馈，支持评分与内容追踪。",
    icon: MessageSquare,
    href: "/feedbacks",
  },
  {
    title: "日志审计",
    description: "按级别与时间窗口筛选日志，快速定位故障。",
    icon: ShieldAlert,
    href: "/logs",
  },
]

export default function Page() {
  return (
    <main className="relative min-h-svh overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-32 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute -right-24 top-20 h-104 w-104 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(255,255,255,0.15),transparent_40%),radial-gradient(circle_at_90%_30%,rgba(56,189,248,0.18),transparent_35%)]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-10 sm:px-8 md:py-16">
        <section className="rounded-3xl border border-white/15 bg-white/8 p-6 shadow-2xl backdrop-blur md:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-cyan-200/10 px-3 py-1 text-xs tracking-[0.2em] text-cyan-100 uppercase">
                <ShieldCheck className="size-3.5" />
                Verhub Admin
              </div>
              <h1 className="text-balance text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl">
                统一管理版本、公告与反馈的交付平台
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-slate-200/90 sm:text-base">
                这个界面作为管理端首页框架，下一步将承载项目列表、版本流水线、反馈详情与日志筛选等子页面。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-white text-slate-900 hover:bg-slate-200">
                <Link href="/projects">
                  进入项目管理
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-white/30 bg-white/10 hover:bg-white/20">
                查看 API 文档
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {quickLinks.map((item) => {
            const Icon = item.icon

            return (
              <article
                key={item.title}
                className="group rounded-2xl border border-white/15 bg-white/6 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-200/40 hover:bg-white/12"
              >
                <div className="mb-4 inline-flex rounded-lg bg-cyan-100/12 p-2 text-cyan-100">
                  <Icon className="size-4" />
                </div>
                <h2 className="text-lg font-medium">
                  {item.href !== "#" ? (
                    <Link className="underline-offset-4 hover:underline" href={item.href}>
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-200/90">{item.description}</p>
              </article>
            )
          })}
        </section>

        <section className="rounded-2xl border border-white/15 bg-black/25 p-5 text-sm text-slate-300 md:flex md:items-center md:justify-between">
          <p>当前阶段已完成：反馈与日志模块后端实现，前端已提供日志审计查询界面。</p>
          <p className="mt-2 font-mono text-xs text-slate-400 md:mt-0">Next.js App Router + shadcn/ui + NestJS API</p>
        </section>
      </div>
    </main>
  )
}
