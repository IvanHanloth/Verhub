"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Code,
  GitBranch,
  Layers,
  Rocket,
  Shield,
  Sparkles,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { getSessionToken } from "@/lib/auth-session"

const features = [
  {
    icon: Layers,
    title: "项目资产管理",
    description: "统一管理项目基础信息、作者、链接和发布状态，信息结构清晰可追踪。",
  },
  {
    icon: Rocket,
    title: "多端版本发布",
    description: "支持 iOS、Android、Web、桌面端等版本策略，下载链接聚合展示。",
  },
  {
    icon: Shield,
    title: "公告治理",
    description: "支持置顶公告与时间维度编排，确保重要信息优先触达。",
  },
  {
    icon: Code,
    title: "反馈闭环",
    description: "收集评分与内容反馈，帮助团队快速定位问题并迭代。",
  },
  {
    icon: GitBranch,
    title: "可审计日志",
    description: "具备结构化日志检索能力，支持运维、排错与分析场景。",
  },
  {
    icon: CheckCircle2,
    title: "API Key 授权",
    description: "按项目和权限范围颁发密钥，兼顾灵活接入与安全边界。",
  },
]

export function HomePageView() {
  const router = useRouter()
  const [hasToken, setHasToken] = React.useState(false)

  React.useEffect(() => {
    const token = getSessionToken().trim()
    setHasToken(Boolean(token))
  }, [])

  return (
    <main className="relative min-h-svh overflow-hidden bg-[#f5f4ef] text-slate-900 dark:bg-[#05070d] dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 left-[-8%] h-96 w-96 rounded-full bg-[#ff8f3a]/25 blur-3xl" />
        <div className="absolute top-[28%] right-[-10%] h-[28rem] w-[28rem] rounded-full bg-[#4aa7a3]/20 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.46),transparent_40%,rgba(16,24,40,0.05))] dark:bg-[linear-gradient(120deg,rgba(3,8,18,0.35),transparent_45%,rgba(255,255,255,0.06))]" />
      </div>

      <nav className="sticky top-0 z-30 border-b border-slate-900/10 bg-[#f5f4ef]/85 backdrop-blur-xl dark:border-white/10 dark:bg-[#05070d]/70">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 sm:px-10">
          <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Sparkles className="size-5 text-[#e6662a]" />
            Verhub
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="hidden gap-2 md:inline-flex">
              <Link href="/doc">
                API 文档
                <BookOpen className="size-4" />
              </Link>
            </Button>
            <Button className="gap-2" onClick={() => router.push("/admin")}>
              {hasToken ? "进入后台" : "管理员登录"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </nav>

      <section className="relative px-6 pt-16 pb-14 sm:px-10 sm:pt-24">
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="inline-flex items-center rounded-full border border-slate-900/10 bg-white/70 px-4 py-1 text-xs tracking-[0.18em] text-slate-700 uppercase dark:border-white/15 dark:bg-white/10 dark:text-slate-200">
              VERSION INTELLIGENCE HUB
            </p>
            <h1 className="mt-6 text-4xl leading-tight font-semibold sm:text-5xl md:text-6xl">
              更好看的项目展示
              <br className="hidden sm:block" />
              更高效的版本运营
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg dark:text-slate-300">
              以文档门户的清晰结构，融合现代产品站的视觉张力。你可以同时管理项目版本、公告信息、反馈与日志，并通过统一
              API 对外服务。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" className="gap-2" onClick={() => router.push("/admin")}>
                {hasToken ? "进入后台" : "管理员登录"}
                <ArrowRight className="size-4" />
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2">
                <Link href="/doc">浏览 API 文档</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-900/10 bg-white/75 p-5 shadow-[0_25px_80px_-45px_rgba(15,23,42,0.55)] backdrop-blur dark:border-white/10 dark:bg-white/5">
            <p className="text-xs tracking-[0.2em] text-slate-500 uppercase dark:text-slate-400">
              Core metrics
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                ["模块", "项目 / 版本 / 公告 / 反馈 / 日志"],
                ["访问方式", "Public API + Admin Console"],
                ["文档能力", "接口详情 + 在线调试"],
                ["部署方式", "Docker + Next.js + NestJS"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-900/10 bg-white/80 p-3 dark:border-white/10 dark:bg-black/20"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-20 sm:px-10 sm:pb-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="text-2xl font-semibold sm:text-3xl">核心能力</h2>
            <p className="hidden text-sm text-slate-600 sm:block dark:text-slate-300">
              结构化、可视化、可运营
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {features.map((item) => {
              const Icon = item.icon
              return (
                <article
                  key={item.title}
                  className="group rounded-3xl border border-slate-900/10 bg-white/75 p-6 shadow-[0_20px_45px_-35px_rgba(30,41,59,0.55)] transition-all duration-300 hover:-translate-y-1 hover:border-[#e6662a]/35 dark:border-white/10 dark:bg-white/5"
                >
                  <Icon className="size-8 text-[#e6662a]" />
                  <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                    {item.description}
                  </p>
                </article>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}
