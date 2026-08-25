import type { Metadata } from "next"

import { PathAnalysis } from "@/components/events/path-analysis"

export const metadata: Metadata = {
  title: "路径分析",
}

export default function DashboardEventsPathAnalysisPage() {
  return <PathAnalysis />
}
