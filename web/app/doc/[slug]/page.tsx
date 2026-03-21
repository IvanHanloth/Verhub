import { notFound } from "next/navigation"
import Link from "next/link"

import { ApiEndpointDetails } from "@/components/docs/api-endpoint-details"
import { getApiEndpointDocBySlug } from "@/lib/api-docs/registry"

type Props = {
  params: Promise<{ slug: string }>
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
