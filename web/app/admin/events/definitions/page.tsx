import type { Metadata } from "next"

import { EventDefinitions } from "@/components/events/event-definitions"

export const metadata: Metadata = {
  title: "事件清单",
}

export default function DashboardEventsDefinitionsPage() {
  return <EventDefinitions />
}
