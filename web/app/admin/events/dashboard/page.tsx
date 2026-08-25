import type { Metadata } from "next"

import { EventsDashboard } from "@/components/events/events-dashboard"

export const metadata: Metadata = {
  title: "分析看板",
}

export default function DashboardEventsDashboardPage() {
  return <EventsDashboard />
}
