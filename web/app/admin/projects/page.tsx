import type { Metadata } from "next"

import { ProjectsDashboard } from "@/components/projects/projects-dashboard"

export const metadata: Metadata = {
  title: "项目管理",
}

export default function DashboardProjectsPage() {
  return <ProjectsDashboard />
}
