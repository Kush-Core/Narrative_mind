import { describe, expect, it } from "vitest"

import { DEFAULT_PANEL_SIZES, type PanelSizes, resolvePanelLayout } from "@/shared/store/ui-store"

/**
 * The invariant these cover is the one the v0 to v1 migration was written to
 * clean up after: the panel group reads its layout as percentages of the panels
 * it is *given*, so a map carrying a size for a panel that is not rendered
 * leaves the visible panels short of the width they asked for. With a third
 * panel that comes and goes, that bug had four arrangements to hide in rather
 * than two — hence deriving the map instead of storing one.
 */

function total(layout: Record<string, number>): number {
  return Object.values(layout).reduce((sum, value) => sum + value, 0)
}

const SIZES: PanelSizes = { explorer: 18, main: 60, aux: 22 }

describe("resolvePanelLayout", () => {
  it("names only the panels that are rendered", () => {
    expect(Object.keys(resolvePanelLayout(SIZES, { explorer: true, aux: true }))).toEqual([
      "explorer",
      "main",
      "aux",
    ])
    expect(Object.keys(resolvePanelLayout(SIZES, { explorer: false, aux: false }))).toEqual([
      "main",
    ])
  })

  it.each([
    ["everything showing", { explorer: true, aux: true }],
    ["dock closed", { explorer: true, aux: false }],
    ["explorer railed", { explorer: false, aux: true }],
    ["main alone", { explorer: false, aux: false }],
  ])("sums to 100 with %s", (_label, visible) => {
    expect(total(resolvePanelLayout(SIZES, visible))).toBeCloseTo(100, 6)
  })

  it("keeps the stored sizes proportional to one another", () => {
    const layout = resolvePanelLayout(SIZES, { explorer: true, aux: false })

    // 18 : 60 held, renormalized over the two rendered panels.
    expect(layout.explorer! / layout.main!).toBeCloseTo(18 / 60, 6)
  })

  it("gives main the whole width when it is the only panel", () => {
    expect(resolvePanelLayout(SIZES, { explorer: false, aux: false })).toEqual({ main: 100 })
  })

  it("normalizes the defaults too, so a fresh workspace is not short of 100", () => {
    expect(
      total(resolvePanelLayout(DEFAULT_PANEL_SIZES, { explorer: true, aux: true })),
    ).toBeCloseTo(100, 6)
  })
})
