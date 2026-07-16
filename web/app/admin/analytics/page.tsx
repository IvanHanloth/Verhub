import type { Metadata } from "next"

import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard"

export const metadata: Metadata = {
  title: "统计大屏",
}

export default function DashboardAnalyticsPage() {
  return <AnalyticsDashboard />
}
