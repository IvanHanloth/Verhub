import * as React from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ChartCard, ChartPlaceholder } from "./chart-card"
import { collapseTail, seriesFill, type DistributionItem } from "./chart-utils"
import { DistributionChart, ShareTable } from "./distribution-chart"
import { toCountryHeat } from "./geo-map-sources"
import { StatTile, computeDelta } from "./stat-tile"
import { StackedTrendChart } from "./trend-chart"

const ITEMS: DistributionItem[] = [
  { key: "WINDOWS:11", label: "Windows 11", count: 60, fill: "var(--series-3)" },
  { key: "LINUX:ubuntu 24.04", label: "Linux ubuntu 24.04", count: 30, fill: "var(--series-4)" },
  { key: "MACOS:26", label: "macOS 26", count: 10, fill: "var(--series-5)" },
]

describe("ChartCard", () => {
  it("renders the title, subtitle and actions", () => {
    render(
      <ChartCard title="系统版本分布" subtitle="共 100 次请求" actions={<button>切换</button>}>
        <p>正文</p>
      </ChartCard>,
    )

    expect(screen.getByRole("heading", { name: "系统版本分布" })).toBeInTheDocument()
    expect(screen.getByText("共 100 次请求")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "切换" })).toBeInTheDocument()
  })
})

describe("ChartPlaceholder", () => {
  it("shows a skeleton while loading and the empty text otherwise", () => {
    const { rerender } = render(<ChartPlaceholder loading />)
    expect(screen.getByRole("status", { name: "加载中" })).toBeInTheDocument()

    rerender(<ChartPlaceholder loading={false} emptyText="没有系统版本记录。" />)
    expect(screen.getByText("没有系统版本记录。")).toBeInTheDocument()
  })
})

describe("DistributionChart", () => {
  it("renders in both views without throwing", () => {
    // Recharts 在 jsdom 里量不到容器尺寸，画不出图元；这里要的是「渲染不炸」，
    // 数值的正确性由 ShareTable 与纯函数的用例覆盖。
    const { container, rerender } = render(
      <DistributionChart items={ITEMS} view="bar" measureLabel="请求数" />,
    )
    expect(container.querySelector("[data-slot='chart']")).toBeInTheDocument()

    rerender(<DistributionChart items={ITEMS} view="donut" measureLabel="请求数" />)
    expect(container.querySelector("[data-slot='chart']")).toBeInTheDocument()
  })

  it("never emits a CSS variable named after a raw category", () => {
    // 类目名里的点和冒号（"WINDOWS:11"）会拼出非法自定义属性，整条规则被丢弃。
    const { container } = render(
      <DistributionChart items={ITEMS} view="donut" measureLabel="请求数" />,
    )

    const style = container.querySelector("style")?.innerHTML ?? ""
    expect(style).toContain("--color-c0")
    expect(style).not.toContain("--color-WINDOWS:11")
    expect(style).not.toMatch(/--color-[^:\s]*[.:][^:\s]*:/)
  })
})

describe("collapseTail", () => {
  it("keeps the head and folds the rest into one 其他 wedge", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      key: `k${index}`,
      label: `分类 ${index}`,
      count: 10,
      fill: "var(--series-1)",
    }))

    const slices = collapseTail(many, 25)

    expect(slices).toHaveLength(9)
    expect(slices.at(-1)).toMatchObject({ label: "其他", count: 2 * 10 + 25 })
  })

  it("omits the tail wedge when there is nothing left over", () => {
    expect(collapseTail(ITEMS)).toHaveLength(3)
  })
})

describe("toCountryHeat", () => {
  it("drops unplaceable buckets and folds 港澳台 into 中国", () => {
    const heat = toCountryHeat([
      { region: "CN", count: 100 },
      { region: "HK", count: 5 },
      { region: "TW", count: 3 },
      { region: "US", count: 20 },
      { region: "UNKNOWN", count: 40 },
      { region: "LOCAL", count: 7 },
    ])

    expect(heat).toEqual([
      { key: "CN", count: 108 },
      { key: "US", count: 20 },
    ])
  })
})

describe("seriesFill", () => {
  it("pins platform colors so the same platform matches across cards", () => {
    // 同一个平台在环形图和堆叠图里必须同色，否则会被读成两回事。
    expect(seriesFill("platform", "WINDOWS", 5)).toBe(seriesFill("platform", "WINDOWS", 0))
  })
})

describe("ShareTable", () => {
  it("renders each row with its share and appends the truncated tail", () => {
    render(
      <ShareTable
        items={ITEMS}
        total={125}
        categoryHeader="系统"
        measureHeader="请求数"
        tailCount={25}
        tailLabel="其他系统版本"
      />,
    )

    expect(screen.getByText("Windows 11")).toBeInTheDocument()
    expect(screen.getByText("48.0%")).toBeInTheDocument()
    // 尾巴显式成行，占比才闭合到 100%。
    expect(screen.getByText("其他系统版本")).toBeInTheDocument()
    expect(screen.getByText("20.0%")).toBeInTheDocument()
  })
})

describe("StackedTrendChart", () => {
  it("renders series whose names are not valid CSS identifiers", () => {
    // 版本号里的点若直接进 --color-<key>，会拼出非法自定义属性、整条规则被丢弃。
    const series = [
      {
        key: "2.3.0",
        data: [
          { bucket: 0, count: 1 },
          { bucket: 3600, count: 4 },
        ],
      },
      {
        key: "2.2.1",
        data: [
          { bucket: 0, count: 3 },
          { bucket: 3600, count: 2 },
        ],
      },
    ]

    const { container } = render(
      <StackedTrendChart series={series} granularity="hour" naming="raw" />,
    )

    const style = container.querySelector("style")?.innerHTML ?? ""
    expect(style).toContain("--color-s0")
    expect(style).not.toContain("--color-2.3.0")
  })
})

describe("computeDelta", () => {
  it("reports a ratio against the previous period", () => {
    expect(computeDelta(150, 100)).toBeCloseTo(0.5)
    expect(computeDelta(50, 100)).toBeCloseTo(-0.5)
  })

  it("does not divide by zero", () => {
    // 上一区间为 0：有量是「新增」，没量是「无从比较」，都不能算成百分比。
    expect(computeDelta(10, 0)).toBe(Number.POSITIVE_INFINITY)
    expect(computeDelta(0, 0)).toBeNull()
  })
})

describe("StatTile", () => {
  it("labels an unmeasurable delta as 新增 rather than a fabricated percentage", () => {
    render(<StatTile label="总请求数" value="120" hint="近 7 天" delta={computeDelta(120, 0)} />)

    expect(screen.getByText("新增")).toBeInTheDocument()
  })

  it("renders no delta badge when there is nothing to compare", () => {
    render(<StatTile label="主流版本" value="1.20.3" hint="占 100%" delta={null} />)

    expect(screen.queryByText("新增")).not.toBeInTheDocument()
    expect(screen.queryByText("持平")).not.toBeInTheDocument()
  })
})
