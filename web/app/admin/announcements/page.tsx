import type { Metadata } from "next"

import { AnnouncementsDashboard } from "@/components/announcements/announcements-dashboard"

export const metadata: Metadata = {
  title: "公告管理",
}

export default function DashboardAnnouncementsPage() {
  return <AnnouncementsDashboard />
}
