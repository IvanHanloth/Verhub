import type { Metadata } from "next"

import { LogsDashboard } from "@/components/logs/logs-dashboard"

export const metadata: Metadata = {
  title: "日志管理",
}

export default function DashboardLogsPage() {
  return <LogsDashboard />
}
