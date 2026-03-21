import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ProjectShowcaseView } from "@/components/projects/project-showcase-view"
import { getProjectShowcaseData } from "@/lib/public-api-server"

type PageProps = {
  params: Promise<{ projectKey: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectKey } = await params
  const data = await getProjectShowcaseData(projectKey)

  if (!data) {
    return {
      title: "项目不存在",
      description: "请求的项目展示页不存在或已下线。",
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  const summary = data.project.description ?? `${data.project.name} 的版本与公告展示页`

  return {
    title: `${data.project.name} | 项目展示`,
    description: summary,
    keywords: [
      data.project.name,
      data.project.project_key,
      "项目展示",
      "版本发布",
      "公告",
      "Verhub",
    ],
    alternates: {
      canonical: `/projects/${data.project.project_key}`,
    },
    openGraph: {
      title: `${data.project.name} | Verhub 项目展示`,
      description: summary,
      url: `/projects/${data.project.project_key}`,
      type: "article",
      images: data.project.icon_url
        ? [
            {
              url: data.project.icon_url,
              alt: `${data.project.name} icon`,
            },
          ]
        : undefined,
    },
  }
}

export default async function ProjectShowcasePage({ params }: PageProps) {
  const { projectKey } = await params
  const data = await getProjectShowcaseData(projectKey)

  if (!data) {
    notFound()
  }

  return (
    <ProjectShowcaseView
      project={data.project}
      versions={data.versions}
      announcements={data.announcements}
    />
  )
}
