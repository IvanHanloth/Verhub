import * as React from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ClientOriginBadges } from "./client-origin-badges"

describe("ClientOriginBadges", () => {
  it("renders address, location, platform and User-Agent", () => {
    render(
      <ClientOriginBadges
        origin={{
          ip: "203.0.113.9",
          user_agent: "verhub-sdk/1.0",
          country_code: "JP",
          country_name: "日本",
          region_name: "Tokyo",
          city: "Shibuya",
          platform: "windows",
        }}
      />,
    )

    expect(screen.getByText("203.0.113.9")).toBeInTheDocument()
    expect(screen.getByText("Shibuya · Tokyo · 日本")).toBeInTheDocument()
    expect(screen.getByText("Windows")).toBeInTheDocument()
    expect(screen.getByText("verhub-sdk/1.0")).toBeInTheDocument()
  })

  it("appends the OS version to the platform badge", () => {
    render(<ClientOriginBadges origin={{ platform: "windows", platform_version: "11" }} />)

    expect(screen.getByText("Windows 11")).toBeInTheDocument()
  })

  it("does not repeat the platform name when the detail already carries it", () => {
    // 发行版形态的明细自带平台名，拼起来会变成「Linux linux mint 21」。
    render(<ClientOriginBadges origin={{ platform: "linux", platform_version: "linux mint 21" }} />)

    expect(screen.getByText("linux mint 21")).toBeInTheDocument()
  })

  it("collapses the duplicate city/region names providers often return", () => {
    render(
      <ClientOriginBadges
        origin={{ ip: "203.0.113.9", region_name: "Berlin", city: "Berlin", country_name: "德国" }}
      />,
    )

    expect(screen.getByText("Berlin · 德国")).toBeInTheDocument()
  })

  it("falls back to the country code when no name was resolved", () => {
    render(<ClientOriginBadges origin={{ ip: "203.0.113.9", country_code: "DE" }} />)

    expect(screen.getByText("DE")).toBeInTheDocument()
  })

  it("renders nothing for a row with no captured origin", () => {
    const { container } = render(
      <ClientOriginBadges origin={{ ip: null, user_agent: null, country_code: null }} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
