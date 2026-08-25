import type { Metadata } from "next"

import { EventsOverview } from "@/components/events/events-overview"

export const metadata: Metadata = {
  title: "行为分析",
}

export default function DashboardEventsOverviewPage() {
  return <EventsOverview />
}
