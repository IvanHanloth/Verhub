import type { Metadata } from "next"

import { RetentionAnalysis } from "@/components/events/retention-analysis"

export const metadata: Metadata = {
  title: "留存分析",
}

export default function DashboardEventsRetentionAnalysisPage() {
  return <RetentionAnalysis />
}
