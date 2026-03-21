import type { Metadata } from "next"

import { ActionsDashboard } from "@/components/actions/actions-dashboard"

export const metadata: Metadata = {
  title: "行为管理",
}

export default function DashboardActionsPage() {
  return <ActionsDashboard />
}
