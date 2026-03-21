import type { Metadata } from "next"

import { HomePageView } from "@/components/marketing/home-page"

export const metadata: Metadata = {
  title: "首页",
  description:
    "Verhub 首页：集中展示项目管理、版本发布、公告治理与 API 文档入口，帮助团队快速搭建公开项目展示中心。",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Verhub 首页 | 项目与版本管理",
    description:
      "集中展示项目管理、版本发布、公告治理与 API 文档入口，帮助团队快速搭建公开项目展示中心。",
    url: "/",
    type: "website",
  },
}

export default function HomePage() {
  return <HomePageView />
}
