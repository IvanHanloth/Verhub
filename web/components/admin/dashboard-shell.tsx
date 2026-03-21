"use client"

import * as React from "react"
import {
  Bell,
  ClipboardList,
  FolderKanban,
  Laptop,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Moon,
  Settings,
  Sun,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"

import { Button } from "@workspace/ui/components/button"

import { getAdminProfile } from "@/lib/auth-api"
import { clearSessionToken, getSessionToken } from "@/lib/auth-session"

import { PageTransition } from "./page-transition"

type Props = {
  children: React.ReactNode
}

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { href: "/admin", label: "概览", icon: LayoutDashboard },
  { href: "/admin/projects", label: "项目管理", icon: FolderKanban },
  { href: "/admin/versions", label: "版本管理", icon: ClipboardList },
  { href: "/admin/announcements", label: "公告管理", icon: Bell },
  { href: "/admin/actions", label: "行为管理", icon: ClipboardList },
  { href: "/admin/feedbacks", label: "反馈管理", icon: MessagesSquare },
  { href: "/admin/logs", label: "日志管理", icon: ClipboardList },
  { href: "/admin/tokens", label: "Token 管理", icon: KeyRound },
  { href: "/admin/settings", label: "管理员设置", icon: Settings },
]

export function DashboardShell({ children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    const token = getSessionToken().trim()
    if (!token) {
      const returnTo = encodeURIComponent(pathname || "/admin")
      router.replace(`/login?returnTo=${returnTo}`)
      return
    }

    void getAdminProfile()
      .then(() => {
        if (!cancelled) {
          setReady(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReady(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [pathname, router])

  function logout() {
    clearSessionToken()
    router.replace("/")
    router.refresh()
  }

  if (!ready) {
    return <div className="min-h-svh bg-slate-100 dark:bg-slate-950" />
  }

  return (
    <div className="admin-unified min-h-svh bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_3%_8%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_96%_2%,rgba(249,115,22,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.7)_0%,rgba(248,250,252,0.85)_100%)] dark:bg-[radial-gradient(circle_at_3%_8%,rgba(14,165,233,0.16),transparent_32%),radial-gradient(circle_at_96%_2%,rgba(249,115,22,0.15),transparent_30%),linear-gradient(180deg,rgba(2,6,23,0.9)_0%,rgba(2,6,23,0.98)_100%)]" />
      <div className="relative mx-auto flex w-full max-w-450 gap-4 px-3 py-4 sm:px-4 lg:gap-5 lg:px-6 lg:py-5">
        <aside
          className={`fixed top-4 bottom-4 left-3 z-40 flex w-70 flex-col justify-between rounded-3xl border border-slate-900/15 bg-white/85 p-5 shadow-2xl backdrop-blur-xl transition-transform duration-300 sm:left-4 lg:sticky lg:top-5 lg:h-[calc(100svh-2.5rem)] lg:translate-x-0 dark:border-white/15 dark:bg-black/45 ${mobileOpen ? "translate-x-0" : "-translate-x-[115%]"}`}
        >
          <div>
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-xs tracking-[0.2em] text-sky-700 uppercase dark:text-sky-300">
                  Verhub Admin
                </p>
                <h1 className="mt-1 text-xl font-semibold">控制台</h1>
              </div>
              <button
                type="button"
                className="rounded-md border border-slate-900/20 px-2 py-1 text-xs lg:hidden dark:border-white/20"
                onClick={() => setMobileOpen(false)}
              >
                关闭
              </button>
            </div>

            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active ? "bg-sky-500/15 text-sky-800 dark:text-sky-200" : "text-slate-700 hover:bg-slate-900/5 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"}`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="bottom-5 flex flex-col gap-4">
            <div className="mt-auto space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs ${theme === "system" ? "border-sky-300 bg-sky-200 text-slate-900" : "border-slate-900/15 text-slate-700 dark:border-white/20 dark:text-slate-300"}`}
                  onClick={() => setTheme("system")}
                  title="跟随系统"
                >
                  <Laptop className="size-3.5" />
                  系统
                </button>
                <button
                  type="button"
                  className={`inline-flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs ${resolvedTheme === "light" ? "border-sky-300 bg-sky-200 text-slate-900" : "border-slate-900/15 text-slate-700 dark:border-white/20 dark:text-slate-300"}`}
                  onClick={() => setTheme("light")}
                  title="浅色模式"
                >
                  <Sun className="size-3.5" />
                  浅色
                </button>
                <button
                  type="button"
                  className={`inline-flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs ${resolvedTheme === "dark" ? "border-sky-300 bg-sky-200 text-slate-900" : "border-slate-900/15 text-slate-700 dark:border-white/20 dark:text-slate-300"}`}
                  onClick={() => setTheme("dark")}
                  title="深色模式"
                >
                  <Moon className="size-3.5" />
                  深色
                </button>
              </div>
              <Button type="button" className="w-full" variant="outline" onClick={logout}>
                <LogOut className="size-4" />
                退出登录
              </Button>
            </div>
          </div>
        </aside>

        {mobileOpen ? (
          <button
            type="button"
            aria-label="关闭菜单"
            className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <main className="w-full flex-1">
          <div className="space-y-4">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-900/20 bg-white/80 px-3 py-1 text-sm shadow-sm lg:hidden dark:border-white/20 dark:bg-black/20"
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              <Menu className="size-4" />
              菜单
            </button>
            <PageTransition routeKey={pathname}>{children}</PageTransition>
          </div>
        </main>
      </div>
    </div>
  )
}
