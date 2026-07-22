import * as React from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ActivityCalendar } from "./activity-calendar"
import { RequestHeatmap } from "./request-heatmap"
import { heatLevel } from "./heat-scale"

const DAY = 86400

/**
 * Local midnight on Sunday 2026-01-04, so the first week needs no leading
 * padding. Built in local time, not parsed from a Z-suffixed string, because
 * the calendar buckets days in the viewer's timezone — a UTC instant would land
 * on Saturday for anyone west of Greenwich and shift the whole grid.
 */
const SUNDAY = new Date(2026, 0, 4).getTime() / 1000

function days(count: number, at: (index: number) => number) {
  return Array.from({ length: count }, (_, index) => ({
    bucket: SUNDAY + index * DAY,
    count: at(index),
  }))
}

describe("heatLevel", () => {
  it("keeps an empty cell out of the hue ramp", () => {
    expect(heatLevel(0, 100)).toBe(0)
  })

  it("scales by quartile of the observed maximum, not an absolute threshold", () => {
    expect(heatLevel(1, 4)).toBe(1)
    expect(heatLevel(2, 4)).toBe(2)
    expect(heatLevel(3, 4)).toBe(3)
    expect(heatLevel(4, 4)).toBe(4)
    // A tiny project and a huge one both use the full ramp.
    expect(heatLevel(400_000, 400_000)).toBe(4)
  })

  it("does not divide by zero when nothing was recorded", () => {
    expect(heatLevel(0, 0)).toBe(0)
  })
})

describe("ActivityCalendar", () => {
  it("renders one cell per day and summarizes the year", () => {
    render(<ActivityCalendar points={days(14, (index) => index)} loading={false} />)

    expect(screen.getAllByRole("button")).toHaveLength(14)
    // 0+1+...+13 = 91, with 13 non-zero days and a peak of 13.
    expect(screen.getByText(/近一年共 91 次请求 · 13 天有流量 · 单日峰值 13/)).toBeInTheDocument()
  })

  it("pads a partial trailing week so every column has seven rows", () => {
    const { container } = render(<ActivityCalendar points={days(9, () => 1)} loading={false} />)

    // 9 days -> 2 columns; the second is padded out with 5 placeholders.
    expect(screen.getAllByRole("button")).toHaveLength(9)
    expect(container.querySelectorAll('[aria-hidden="true"].size-3')).not.toHaveLength(0)
  })

  it("shows the empty state instead of a blank grid", () => {
    render(<ActivityCalendar points={[]} loading={false} />)

    expect(screen.getByText("暂无历史请求记录。")).toBeInTheDocument()
  })
})

describe("RequestHeatmap", () => {
  const cells = Array.from({ length: 7 }, (_, weekday) =>
    Array.from({ length: 24 }, (_, hour) => ({ weekday, hour, count: hour })),
  ).flat()

  it("renders the full 7x24 grid", () => {
    render(<RequestHeatmap cells={cells} loading={false} />)

    expect(screen.getAllByRole("button")).toHaveLength(168)
  })

  it("reports the peak and states that hours are in the source timezone", () => {
    render(<RequestHeatmap cells={cells} loading={false} />)

    expect(screen.getByText(/峰值 23 次 · 按来源当地时区/)).toBeInTheDocument()
  })

  it("shows the empty state when no cells are returned", () => {
    render(<RequestHeatmap cells={[]} loading={false} />)

    expect(screen.getByText("所选范围内暂无请求记录。")).toBeInTheDocument()
  })
})
