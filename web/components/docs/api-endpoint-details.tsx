import type { ApiEndpointDoc } from "@/lib/api-docs/types"

import { ApiEndpointOverview } from "./api-endpoint-overview"
import { DocTryItOut } from "./doc-try-it-out"

type Props = {
  doc: ApiEndpointDoc
}

export function ApiEndpointDetails({ doc }: Props) {
  return (
    <article className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <ApiEndpointOverview doc={doc} />

      <div className="xl:sticky xl:top-22 xl:h-fit">
        <DocTryItOut doc={doc} />
      </div>
    </article>
  )
}
