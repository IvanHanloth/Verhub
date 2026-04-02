import * as React from "react"

type UsePaginationOptions = {
  pageSize: number
}

type UsePaginationReturn = {
  offset: number
  setOffset: React.Dispatch<React.SetStateAction<number>>
  total: number
  setTotal: React.Dispatch<React.SetStateAction<number>>
  page: number
  totalPages: number
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  /** Adjust offset after deleting the last item on a page. */
  adjustAfterDelete: (remainingItems: number) => void
  resetOffset: () => void
}

export function usePagination({ pageSize }: UsePaginationOptions): UsePaginationReturn {
  const [offset, setOffset] = React.useState(0)
  const [total, setTotal] = React.useState(0)

  const page = Math.floor(offset / pageSize) + 1
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const hasPrev = offset > 0
  const hasNext = offset + pageSize < total

  const onPrev = React.useCallback(() => {
    setOffset((prev) => Math.max(0, prev - pageSize))
  }, [pageSize])

  const onNext = React.useCallback(() => {
    setOffset((prev) => prev + pageSize)
  }, [pageSize])

  const adjustAfterDelete = React.useCallback(
    (remainingItems: number) => {
      if (remainingItems === 0 && offset > 0) {
        setOffset(Math.max(0, offset - pageSize))
      }
    },
    [offset, pageSize],
  )

  const resetOffset = React.useCallback(() => {
    setOffset(0)
  }, [])

  return {
    offset,
    setOffset,
    total,
    setTotal,
    page,
    totalPages,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    adjustAfterDelete,
    resetOffset,
  }
}
