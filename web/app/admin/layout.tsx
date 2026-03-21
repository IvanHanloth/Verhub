import type { Metadata } from "next"

import { DashboardShell } from "@/components/admin/dashboard-shell"

export const metadata: Metadata = {
  title: {
    default: "后台控制台",
    template: "%s | Verhub Admin",
  },
  description: "Verhub 后台管理控制台",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <DashboardShell>{children}</DashboardShell>
}
