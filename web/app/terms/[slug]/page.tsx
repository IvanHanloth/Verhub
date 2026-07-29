import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { TermsDocumentView } from "@/components/terms/terms-document-view"
import { RouteTransition } from "@/components/route-transition"
import { getTermsDocument, listTermsDocuments } from "@/lib/public-api-server"

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const document = await getTermsDocument(slug)

  if (!document) {
    return { title: "条款文档", robots: { index: false, follow: false } }
  }

  return {
    title: document.title,
    description: document.summary,
    alternates: {
      canonical: `/terms/${document.slug}`,
    },
    openGraph: {
      title: `${document.title} | Verhub`,
      description: document.summary,
      url: `/terms/${document.slug}`,
      type: "article",
    },
  }
}

export default async function TermsDocumentPage({ params }: PageProps) {
  const { slug } = await params
  const [document, documents] = await Promise.all([getTermsDocument(slug), listTermsDocuments()])

  // 清单读到了却没有这份文档，说明 slug 确实不存在；清单也空则是后端不可达，
  // 这种情况交给页面提示重试，不能把服务故障说成「页面不存在」。
  if (!document && documents.length > 0) {
    notFound()
  }

  return (
    <RouteTransition>
      <TermsDocumentView document={document} documents={documents} activeSlug={slug} />
    </RouteTransition>
  )
}
