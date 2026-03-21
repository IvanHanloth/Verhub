"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, BookOpen, Shield, Zap, Code, GitBranch, CheckCircle2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { getSessionToken } from "@/lib/auth-session"

export default function DocumentationPage() {
  const router = useRouter()
  const [hasToken, setHasToken] = React.useState(false)

  React.useEffect(() => {
    const token = getSessionToken().trim()
    setHasToken(!!token)
  }, [])

  const handleEnterAdmin = () => {
    router.push("/admin")
  }

  return (
    <main className="min-h-svh bg-linear-to-b from-slate-50 to-slate-100 text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 border-b border-slate-200/50 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-black/20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
          <div className="text-xl font-bold">Verhub</div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link href="/doc">
                查看 API 文档
                <BookOpen className="size-4" />
              </Link>
            </Button>
            <Button onClick={handleEnterAdmin} className="gap-2">
              <span>{hasToken ? "进入后台" : "管理员登录"}</span>
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 py-20 sm:px-8 sm:py-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-block rounded-full border border-blue-200/50 bg-blue-50/50 px-4 py-1.5 text-sm font-medium text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200">
            欢迎使用 Verhub
          </div>
          <h1 className="mb-6 text-4xl leading-tight font-bold sm:text-5xl md:text-6xl">
            现代化项目管理平台
          </h1>
          <p className="mb-8 text-lg text-slate-600 sm:text-xl dark:text-slate-300">
            Verhub 提供完整的版本管理、公告发布、反馈收集、日志查询等功能，
            帮助你高效管理项目和用户互动。
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-6 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-3xl font-bold">核心功能</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: BookOpen,
                title: "项目管理",
                description: "创建和管理多个项目，组织应用的不同版本和更新",
              },
              {
                icon: Zap,
                title: "版本发布",
                description: "轻松发布新版本，支持多平台（iOS、Android、Web等）",
              },
              {
                icon: Shield,
                title: "公告管理",
                description: "发布重要公告，置顶关键信息，及时通知用户",
              },
              {
                icon: Code,
                title: "反馈管理",
                description: "收集用户反馈，记录评分，改善产品体验",
              },
              {
                icon: GitBranch,
                title: "日志系统",
                description: "完整的操作日志，支持多级别筛选和日期范围查询",
              },
              {
                icon: CheckCircle2,
                title: "Token 管理",
                description: "生成 API 密钥，灵活配置权限和有效期",
              },
            ].map((feature, index) => {
              const Icon = feature.icon
              return (
                <div
                  key={index}
                  className="rounded-2xl border border-slate-200/50 bg-white/50 p-6 backdrop-blur dark:border-white/10 dark:bg-white/5"
                >
                  <Icon className="mb-4 size-8 text-blue-600 dark:text-blue-400" />
                  <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {feature.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-slate-200/50 px-6 py-16 sm:px-8 sm:py-24 dark:border-white/10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold">立即开始</h2>
          <p className="mb-8 text-lg text-slate-600 dark:text-slate-400">
            登录管理员后台，开始管理你的项目和版本
          </p>
          <Button onClick={handleEnterAdmin} size="lg" className="gap-2 text-lg">
            {hasToken ? "进入后台" : "前往登录"}
            <ArrowRight className="size-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/50 px-6 py-8 sm:px-8 dark:border-white/10">
        <div className="mx-auto max-w-6xl text-center text-sm text-slate-600 dark:text-slate-400">
          <p>Verhub © 2026. 现代化项目管理平台。</p>
        </div>
      </footer>
    </main>
  )
}
