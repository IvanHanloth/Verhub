import type { Metadata } from "next"

import { QueryBuilder } from "@/components/events/query-builder"

export const metadata: Metadata = {
  title: "查询构建器",
}

export default function DashboardEventsQueryBuilderPage() {
  return <QueryBuilder />
}
