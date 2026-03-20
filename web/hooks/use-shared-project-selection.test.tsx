import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { useSharedProjectSelection } from "./use-shared-project-selection"

function SyncProbe({ name }: { name: string }) {
  const { selectedProjectId, setSelectedProjectId } = useSharedProjectSelection()

  return (
    <div>
      <p>{`${name}:${selectedProjectId || "(empty)"}`}</p>
      <button type="button" onClick={() => setSelectedProjectId("project-2")}>
        {`set-${name}`}
      </button>
    </div>
  )
}

describe("useSharedProjectSelection", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("loads initial selection from localStorage", async () => {
    window.localStorage.setItem("verhub.admin.selectedProjectId", "project-1")

    render(<SyncProbe name="probe" />)

    expect(await screen.findByText("probe:project-1")).toBeInTheDocument()
  })

  it("syncs value across multiple hook instances via custom event", async () => {
    render(
      <>
        <SyncProbe name="left" />
        <SyncProbe name="right" />
      </>,
    )

    fireEvent.click(screen.getByRole("button", { name: "set-left" }))

    expect(await screen.findByText("left:project-2")).toBeInTheDocument()
    expect(await screen.findByText("right:project-2")).toBeInTheDocument()
    expect(window.localStorage.getItem("verhub.admin.selectedProjectId")).toBe("project-2")
  })
})
