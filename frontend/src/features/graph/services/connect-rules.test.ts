/**
 * The rules of connecting.
 *
 * These decide which nodes light up as legal destinations and which direction a
 * resulting relationship runs in. Getting either wrong produces an affordance
 * that offers a write the backend will refuse — which is the failure this
 * module exists to make impossible, so it is pinned here.
 */

import { describe, expect, it } from "vitest"

import type { GraphModel, GraphNode } from "@/features/graph/model/graph.types"
import {
  buildEditingVisual,
  endpointFromNode,
  resolveConnection,
  validConnectionTargets,
} from "@/features/graph/services/connect-rules"

function node(id: string, kind: GraphNode["kind"], label = id): GraphNode {
  return { id, label, kind }
}

const CHARACTER = node("c-1", "Character", "Mira")
const OTHER_CHARACTER = node("c-2", "Character", "Corin")
const FACTION = node("f-1", "Faction", "Tidebinders")
const LOCATION = node("l-1", "Location", "Greyfen")
const UNKNOWN = node("x-1", "Unknown", "Something")

function model(...nodes: GraphNode[]): GraphModel {
  return { nodes, edges: [], edgesAreComplete: true }
}

describe("validConnectionTargets", () => {
  it("offers every other entity when the source is a Character", () => {
    const targets = validConnectionTargets(
      model(CHARACTER, OTHER_CHARACTER, FACTION, LOCATION),
      CHARACTER,
    )

    expect(targets.map((n) => n.id)).toEqual(["c-2", "f-1", "l-1"])
  })

  it("offers only Characters when the source is not one", () => {
    // A Faction can only be connected *by* a character; Faction→Location is not
    // a request the backend has.
    const targets = validConnectionTargets(
      model(CHARACTER, OTHER_CHARACTER, FACTION, LOCATION),
      FACTION,
    )

    expect(targets.map((n) => n.id)).toEqual(["c-1", "c-2"])
  })

  it("never offers the source itself", () => {
    const targets = validConnectionTargets(model(CHARACTER, OTHER_CHARACTER), CHARACTER)

    expect(targets.map((n) => n.id)).not.toContain(CHARACTER.id)
  })

  it("excludes nodes of an unrecognised kind", () => {
    // No collection behind them, so nothing to write against.
    const targets = validConnectionTargets(model(CHARACTER, UNKNOWN, FACTION), CHARACTER)

    expect(targets.map((n) => n.id)).toEqual(["f-1"])
  })

  it("offers nothing at all from an unrecognised source", () => {
    expect(validConnectionTargets(model(CHARACTER, UNKNOWN), UNKNOWN)).toEqual([])
  })

  it("returns an empty list when a network holds nothing connectable", () => {
    const targets = validConnectionTargets(model(FACTION, LOCATION), FACTION)

    expect(targets).toEqual([])
  })
})

describe("buildEditingVisual", () => {
  it("names the source and every legal destination", () => {
    const visual = buildEditingVisual(CHARACTER, [FACTION, LOCATION], null)

    expect(visual).toEqual({
      sourceId: "c-1",
      validTargetIds: ["f-1", "l-1"],
      previewTargetId: undefined,
    })
  })

  it("previews a hovered node that is a legal destination", () => {
    const visual = buildEditingVisual(CHARACTER, [FACTION], "f-1")

    expect(visual.previewTargetId).toBe("f-1")
  })

  it("refuses to preview a node that is not a legal destination", () => {
    // The renderer dims invalid nodes; drawing a proposed edge to one would
    // contradict the dimming and promise a write that cannot happen.
    const visual = buildEditingVisual(CHARACTER, [FACTION], "l-1")

    expect(visual.previewTargetId).toBeUndefined()
  })
})

describe("resolveConnection", () => {
  it("puts the Character first when connecting from one", () => {
    const outcome = resolveConnection(CHARACTER, FACTION)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.endpoints.source.id).toBe("c-1")
    expect(outcome.endpoints.target.id).toBe("f-1")
  })

  it("inverts the direction when connecting from a non-Character", () => {
    // Starting at a faction and clicking a character still writes
    // character→faction, because that is the only direction that exists.
    const outcome = resolveConnection(FACTION, CHARACTER)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.endpoints.source.id).toBe("c-1")
    expect(outcome.endpoints.target.id).toBe("f-1")
  })

  it("keeps the gesture's direction between two Characters", () => {
    const outcome = resolveConnection(CHARACTER, OTHER_CHARACTER)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.endpoints.source.id).toBe("c-1")
    expect(outcome.endpoints.target.id).toBe("c-2")
  })

  it("refuses a pair with no Character in it", () => {
    const outcome = resolveConnection(FACTION, LOCATION)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toContain("must involve a character")
  })

  it("refuses a node connected to itself", () => {
    const outcome = resolveConnection(CHARACTER, CHARACTER)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toContain("cannot be related to itself")
  })

  it("refuses an unrecognised node", () => {
    const outcome = resolveConnection(CHARACTER, UNKNOWN)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toContain("not recognised")
  })
})

describe("endpointFromNode", () => {
  it("carries id, name, and kind", () => {
    expect(endpointFromNode(CHARACTER)).toEqual({ id: "c-1", name: "Mira", kind: "Character" })
  })

  it("returns null for an unrecognised kind", () => {
    expect(endpointFromNode(UNKNOWN)).toBeNull()
  })
})
