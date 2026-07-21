/**
 * Shared 5-step sequential scale for the density grids.
 *
 * Steps are quartiles of the observed maximum rather than absolute counts: a
 * project serving 50 requests a day and one serving 500k both need the grid to
 * show *their* busy periods, and a fixed threshold would flatten one of them
 * into a single color.
 */

export const HEAT_STEP_VARS = [
  "var(--heat-0)",
  "var(--heat-1)",
  "var(--heat-2)",
  "var(--heat-3)",
  "var(--heat-4)",
] as const

/** 0 for an empty cell, else 1..4 by quartile of `max`. */
export function heatLevel(count: number, max: number): number {
  if (count <= 0 || max <= 0) {
    return 0
  }

  const ratio = count / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

export function heatColor(count: number, max: number): string {
  return HEAT_STEP_VARS[heatLevel(count, max)]!
}
