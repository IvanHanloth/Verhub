"use client"

import * as React from "react"
import { BarChart3, KeyRound, LayoutDashboard, LogOut, Menu, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

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
  { href: "/dashboard", label: "概览", icon: LayoutDashboard },
  { href: "/dashboard/analytics", label: "统计图表", icon: BarChart3 },
  { href: "/dashboard/tokens", label: "Token 管理", icon: KeyRound },
  { href: "/dashboard/settings", label: "管理员设置", icon: Settings },
]

export function DashboardShell({ children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    const token = getSessionToken().trim()
    if (!token) {
      const returnTo = encodeURIComponent(pathname || "/dashboard")
      router.replace(`/?returnTo=${returnTo}`)
      return
    }

    setReady(true)
  }, [pathname, router])

  function logout() {
    clearSessionToken()
    router.replace("/")
  }

  if (!ready) {
    return <div className="min-h-svh bg-slate-950" />
  }

  return (
    <div className="min-h-svh bg-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_5%_20%,rgba(56,189,248,0.17),transparent_35%),radial-gradient(circle_at_90%_0%,rgba(251,146,60,0.15),transparent_35%)]" />
      <div className="relative mx-auto flex w-full max-w-[1400px]">
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-72 border-r border-white/10 bg-black/40 p-5 backdrop-blur-xl transition-transform duration-300 lg:sticky lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="text-xs tracking-[0.2em] text-cyan-200 uppercase">Verhub Admin</p>
              <h1 className="mt-1 text-xl font-semibold">控制台</h1>
            </div>
            <button
              type="button"
              className="rounded-md border border-white/20 px-2 py-1 text-xs lg:hidden"
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
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active ? "bg-cyan-300/15 text-cyan-100" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300">
            长期 Token 用于后续 API 调用，建议为每个系统分配独立 scope，并设置 30 天左右有效期。
          </div>

          <Button type="button" className="mt-4 w-full" variant="outline" onClick={logout}>
            <LogOut className="size-4" />
            退出登录
          </Button>
        </aside>

        <div className="min-h-svh w-full flex-1 px-4 py-4 sm:px-6 lg:px-8">
          <header className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-1 text-sm lg:hidden"
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              <Menu className="size-4" />
              菜单
            </button>
            <p className="text-sm text-slate-300">现代化后台管理系统</p>
          </header>

          <PageTransition routeKey={pathname}>{children}</PageTransition>
        </div>
      </div>
    </div>
  )
}
