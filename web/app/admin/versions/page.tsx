import type { Metadata } from "next"

import { VersionsDashboard } from "@/components/versions/versions-dashboard"

export const metadata: Metadata = {
  title: "版本管理",
}

export default function DashboardVersionsPage() {
  return <VersionsDashboard />
}
