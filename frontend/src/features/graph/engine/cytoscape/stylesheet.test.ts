// @vitest-environment jsdom

/**
 * The Cytoscape stylesheet.
 *
 * Runs in jsdom because the stylesheet resolves design tokens through
 * `getComputedStyle`. It cannot paint here — Cytoscape's canvas renderer needs a
 * real 2D context — but painting is not what is at risk. What is at risk is the
 * stylesheet losing a rule, or an entity kind silently ending up uncoloured
 * while the legend still advertises it. That is what these pin.
 */

import { beforeEach, describe, expect, it } from "vitest"

import { buildStylesheet } from "@/features/graph/engine/cytoscape/stylesheet"
import { ENTITY_KIND_IDENTITIES } from "@/shared/domain/entity-kinds"

function selectors(): string[] {
  return buildStylesheet().map((rule) => rule.selector)
}

describe("buildStylesheet", () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ""
  })

  it("gives every entity kind its own colour rule", () => {
    // If a kind were missing here it would render in the fallback grey while the
    // legend still showed it in colour — the two must come from one source.
    const rules = selectors()

    for (const identity of ENTITY_KIND_IDENTITIES) {
      expect(rules).toContain(`node[kind = "${identity.kind}"]`)
    }
  })

  it("orders kind colours before the focus and unlinked rules", () => {
    // Cytoscape applies matching rules in order, so the state rules must be able
    // to override the kind colour, not the other way round.
    const rules = selectors()
    const lastKind = Math.max(
      ...ENTITY_KIND_IDENTITIES.map((identity) => rules.indexOf(`node[kind = "${identity.kind}"]`)),
    )

    expect(lastKind).toBeLessThan(rules.indexOf("node[?isFocus]"))
    expect(lastKind).toBeLessThan(rules.indexOf("node[?isUnlinked]"))
  })

  it("carries rules for every visual state the renderer relies on", () => {
    const rules = selectors()

    expect(rules).toContain("node")
    expect(rules).toContain("edge")
    expect(rules).toContain("node[?isFocus]")
    expect(rules).toContain("node[?isUnlinked]")
    expect(rules).toContain("node:selected")
    expect(rules).toContain("edge:selected")
  })

  it("labels nodes from the data field the element mapper writes", () => {
    const nodeRule = buildStylesheet().find((rule) => rule.selector === "node")

    expect(nodeRule?.style).toMatchObject({ label: "data(label)" })
  })

  it("always yields a paintable colour, even where var() cannot resolve", () => {
    // jsdom does not resolve `var()`, so this exercises the fallback path: a
    // missing or unresolvable token must cost a colour, never the whole graph.
    //
    // The *resolution* path cannot be tested here and is deliberately not
    // faked. Tokens are authored in `oklch()`, which Cytoscape cannot parse, so
    // correctness depends on the browser converting them to `rgb()` — something
    // only a real browser does. That is verified by driving the app, and the
    // failure it caught (every node grey while the legend showed colour) is
    // exactly what a mocked assertion here would have missed.
    for (const identity of ENTITY_KIND_IDENTITIES) {
      const rule = buildStylesheet().find((r) => r.selector === `node[kind = "${identity.kind}"]`)
      const style = rule?.style as Record<string, unknown> | undefined
      expect(typeof style?.["background-color"]).toBe("string")
    }
  })

  it("leaves no probe element behind in the document", () => {
    const before = document.body.childElementCount
    buildStylesheet()
    expect(document.body.childElementCount).toBe(before)
  })
})
