"use client"

import * as React from "react"
import { FileText, Github, Languages, UserCog } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

/**
 * 「网站设置」的子菜单外壳。管理员账户只是其中一项，后续新的实例级设置
 * （如 GitHub App、条款）都以子页形式挂进来，避免侧边栏一级菜单持续膨胀。
 */
const settingsNavItems = [
  { href: "/admin/settings", label: "管理员设置", icon: UserCog },
  { href: "/admin/settings/github-app", label: "GitHub APP 设置", icon: Github },
  { href: "/admin/settings/translation", label: "AI 翻译设置", icon: Languages },
  { href: "/admin/settings/terms", label: "条款设置", icon: FileText },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2">
        {settingsNavItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition ${
                active
                  ? "border-sky-500/40 bg-sky-500/15 text-sky-800 dark:text-sky-200"
                  : "border-slate-900/15 text-slate-700 hover:bg-slate-900/5 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
              }`}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
