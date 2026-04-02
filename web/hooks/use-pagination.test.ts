import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { usePagination } from "./use-pagination"

describe("usePagination", () => {
  const pageSize = 10

  it("initializes with page 1 and offset 0", () => {
    const { result } = renderHook(() => usePagination({ pageSize }))
    expect(result.current.offset).toBe(0)
    expect(result.current.total).toBe(0)
    expect(result.current.page).toBe(1)
    expect(result.current.totalPages).toBe(1)
    expect(result.current.hasPrev).toBe(false)
    expect(result.current.hasNext).toBe(false)
  })

  it("computes page and totalPages from total", () => {
    const { result } = renderHook(() => usePagination({ pageSize }))

    act(() => result.current.setTotal(25))

    expect(result.current.totalPages).toBe(3)
    expect(result.current.page).toBe(1)
    expect(result.current.hasNext).toBe(true)
  })

  it("onNext advances offset by pageSize", () => {
    const { result } = renderHook(() => usePagination({ pageSize }))

    act(() => result.current.setTotal(25))
    act(() => result.current.onNext())

    expect(result.current.offset).toBe(10)
    expect(result.current.page).toBe(2)
    expect(result.current.hasPrev).toBe(true)
    expect(result.current.hasNext).toBe(true)
  })

  it("onPrev decreases offset by pageSize, clamped at 0", () => {
    const { result } = renderHook(() => usePagination({ pageSize }))

    act(() => {
      result.current.setTotal(25)
      result.current.setOffset(10)
    })
    act(() => result.current.onPrev())

    expect(result.current.offset).toBe(0)
    expect(result.current.hasPrev).toBe(false)
  })

  it("onPrev doesn't go below 0", () => {
    const { result } = renderHook(() => usePagination({ pageSize }))

    act(() => result.current.onPrev())

    expect(result.current.offset).toBe(0)
  })

  it("resetOffset sets offset to 0", () => {
    const { result } = renderHook(() => usePagination({ pageSize }))

    act(() => result.current.setOffset(20))
    act(() => result.current.resetOffset())

    expect(result.current.offset).toBe(0)
  })

  it("adjustAfterDelete moves back when the deleted item was the last on the page", () => {
    const { result } = renderHook(() => usePagination({ pageSize }))

    act(() => {
      result.current.setTotal(11)
      result.current.setOffset(10)
    })

    // Remaining items on current page = 0 (last item deleted)
    act(() => result.current.adjustAfterDelete(0))

    expect(result.current.offset).toBe(0)
  })

  it("adjustAfterDelete does nothing when items remain on the page", () => {
    const { result } = renderHook(() => usePagination({ pageSize }))

    act(() => {
      result.current.setTotal(15)
      result.current.setOffset(10)
    })

    act(() => result.current.adjustAfterDelete(4))

    expect(result.current.offset).toBe(10)
  })

  it("adjustAfterDelete does nothing on the first page", () => {
    const { result } = renderHook(() => usePagination({ pageSize }))

    act(() => result.current.setTotal(1))
    act(() => result.current.adjustAfterDelete(0))

    expect(result.current.offset).toBe(0)
  })
})
