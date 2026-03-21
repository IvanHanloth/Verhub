import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "分析重定向",
}

export default function AnalyticsRedirectPage() {
  redirect("/admin")
}
