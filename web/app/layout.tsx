import type { Metadata } from "next"
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { resolveSiteUrl } from "@/lib/seo"
import { cn } from "@workspace/ui/lib/utils"

const fontSans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL(resolveSiteUrl()),
  title: {
    default: "Verhub | 现代化项目与版本管理平台",
    template: "%s | Verhub",
  },
  description:
    "Verhub 提供项目展示、版本发布、公告管理、反馈收集与 API 文档，帮助团队高效管理产品全生命周期。",
  applicationName: "Verhub",
  keywords: ["Verhub", "项目管理", "版本管理", "公告管理", "API 文档", "反馈系统"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    title: "Verhub | 现代化项目与版本管理平台",
    description: "统一管理项目、版本、公告、反馈与日志，并通过文档化 API 对外服务。",
    siteName: "Verhub",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Verhub | 现代化项目与版本管理平台",
    description: "统一管理项目、版本、公告、反馈与日志，并通过文档化 API 对外服务。",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", fontSans.variable)}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
