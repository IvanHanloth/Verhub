import type { Metadata } from "next"
import Link from "next/link"
import { Info } from "lucide-react"

import { AdminCard } from "@/components/admin/admin-card"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { ThemeLogo } from "@/components/branding/theme-logo"

const APP_INFO = {
  name: "Verhub",
  projectId: "ivanhanloth-verhub",
  currentVersion: "1.0.0",
  releaseTitle: "Verhub 初版发布",
  releaseDate: "2026-03-22 00:00:00",
  releaseNotes: "提供项目、版本、公告、反馈、行为和日志管理能力，内置 API 文档中心与在线调试入口。",
  officialWebsite: "https://verhub.hanloth.cn",
  documentation: "https://verhub.hanloth.cn/doc",
  releasePage: "https://github.com/IvanHanloth/verhub/releases",
  repository: "https://github.com/IvanHanloth/verhub",
}

export const metadata: Metadata = {
  title: "关于 Verhub",
}

export default function AdminAboutPage() {
  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="关于 Verhub"
        description="当前版本、发布信息、检查更新与官网入口。"
        badge="Verhub About"
        icon={Info}
        actions={<ThemeLogo imgClassName="h-10 w-auto" alt="Verhub" />}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <AdminCard>
          <p className="text-sm text-slate-700 dark:text-slate-300">当前系统版本</p>
          <p className="mt-2 text-3xl font-semibold">{APP_INFO.currentVersion}</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{APP_INFO.releaseTitle}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            发布时间：{APP_INFO.releaseDate}
          </p>
        </AdminCard>

        <AdminCard>
          <p className="text-sm text-slate-700 dark:text-slate-300">检查更新</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            点击下方按钮前往发布页手动检查新版本与更新日志。
          </p>
          <div className="mt-3">
            <Link
              href={APP_INFO.releasePage}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
            >
              检查更新
            </Link>
          </div>
        </AdminCard>
      </div>

      <AdminCard>
        <h2 className="text-lg font-semibold">项目资料</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">项目 ID</dt>
            <dd className="mt-1 font-medium">{APP_INFO.projectId}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">项目名称</dt>
            <dd className="mt-1 font-medium">{APP_INFO.name}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">当前版本</dt>
            <dd className="mt-1 font-medium">{APP_INFO.currentVersion}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">发布标题</dt>
            <dd className="mt-1 font-medium">{APP_INFO.releaseTitle}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-slate-500 dark:text-slate-400">发布说明</dt>
            <dd className="mt-1 leading-relaxed font-medium">{APP_INFO.releaseNotes}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={APP_INFO.officialWebsite}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
          >
            官网
          </Link>

          <Link
            href={APP_INFO.documentation}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
          >
            文档中心
          </Link>

          <Link
            href={APP_INFO.repository}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
          >
            代码仓库
          </Link>
        </div>
      </AdminCard>
    </section>
  )
}
