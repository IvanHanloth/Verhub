import type { Metadata } from "next"

import { FilesDashboard } from "@/components/files/files-dashboard"

export const metadata: Metadata = {
  title: "文件分发",
}

export default function DashboardFilesPage() {
  return <FilesDashboard />
}
