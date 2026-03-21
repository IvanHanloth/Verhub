import type { Metadata } from "next"

import { FeedbacksDashboard } from "@/components/feedbacks/feedbacks-dashboard"

export const metadata: Metadata = {
  title: "反馈管理",
}

export default function DashboardFeedbacksPage() {
  return <FeedbacksDashboard />
}
