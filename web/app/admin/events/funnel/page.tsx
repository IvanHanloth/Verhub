import type { Metadata } from "next"

import { FunnelAnalysis } from "@/components/events/funnel-analysis"

export const metadata: Metadata = {
  title: "漏斗分析",
}

export default function DashboardEventsFunnelAnalysisPage() {
  return <FunnelAnalysis />
}
