import { Button } from "@workspace/ui/components/button"

type AdminListHeaderProps = {
  title: string
  total: number
  page: number
  totalPages: number
}

export function AdminListHeader({ title, total, page, totalPages }: AdminListHeaderProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        共 {total} 条，当前第 {page}/{totalPages} 页
      </p>
    </div>
  )
}

type AdminPaginationProps = {
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}

export function AdminPagination({ hasPrev, hasNext, onPrev, onNext }: AdminPaginationProps) {
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-2">
      <Button
        type="button"
        variant="outline"
        className="border-white/20 bg-white/5"
        disabled={!hasPrev}
        onClick={onPrev}
      >
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        className="border-white/20 bg-white/5"
        disabled={!hasNext}
        onClick={onNext}
      >
        下一页
      </Button>
    </div>
  )
}
