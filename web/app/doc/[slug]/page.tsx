import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"

import { ApiEndpointDetails } from "@/components/docs/api-endpoint-details"
import { getApiEndpointDocBySlug } from "@/lib/api-docs/registry"

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = getApiEndpointDocBySlug(slug)

  if (!doc) {
    return {
      title: "接口不存在",
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  return {
    title: `${doc.title} API 文档`,
    description: doc.description,
    alternates: {
      canonical: `/doc/${doc.slug}`,
    },
    openGraph: {
      title: `${doc.title} | Verhub API 文档`,
      description: doc.description,
      url: `/doc/${doc.slug}`,
      type: "article",
    },
  }
}

export default async function ApiDocDetailPage({ params }: Props) {
  const { slug } = await params
  const doc = getApiEndpointDocBySlug(slug)

  if (!doc) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <div className="md:hidden">
        <Link
          href="/doc"
          className="inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/10"
        >
          返回 API 目录
        </Link>
      </div>
      <ApiEndpointDetails doc={doc} />
    </div>
  )
}
