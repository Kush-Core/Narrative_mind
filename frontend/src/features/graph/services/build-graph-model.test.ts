/**
 * The model builder — where the backend's missing-edge constraint is handled.
 *
 * These are the most important tests in the subsystem. The builder is what
 * decides whether an edge is asserted, and asserting an edge that was never
 * reported would make the graph confidently wrong. That property is pinned here.
 */

import { describe, expect, it } from "vitest"

import type { CharacterNetwork } from "@/features/graph/model/graph.schema"
import { buildEgoNetworkModel } from "@/features/graph/services/build-graph-model"

function network(overrides: Partial<CharacterNetwork> = {}): CharacterNetwork {
  return {
    center: { id: "c-1", name: "Aria Vane" },
    neighbors: [
      { id: "c-2", name: "Roderic", labels: ["Character"] },
      { id: "l-1", name: "Dunhollow", labels: ["Location"] },
    ],
    ...overrides,
  }
}

describe("depth 1 — adjacency is known", () => {
  it("draws an edge from the centre to every neighbour", () => {
    const model = buildEgoNetworkModel(network(), 1)

    expect(model.edges).toHaveLength(2)
    expect(model.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ["c-1", "c-2"],
      ["c-1", "l-1"],
    ])
  })

  it("reports the edge set as complete", () => {
    expect(buildEgoNetworkModel(network(), 1).edgesAreComplete).toBe(true)
  })

  it("does not mark any node as unlinked", () => {
    const model = buildEgoNetworkModel(network(), 1)
    expect(model.nodes.every((node) => !node.isUnlinked)).toBe(true)
  })
})

describe("depth > 1 — adjacency is unknown", () => {
  // The Cypher returns nodes reachable within N hops with no indication of which
  // is adjacent to which. Drawing centre→node edges would assert direct
  // relationships that were never reported.
  it("draws no edges at all rather than inventing them", () => {
    expect(buildEgoNetworkModel(network(), 2).edges).toEqual([])
    expect(buildEgoNetworkModel(network(), 3).edges).toEqual([])
  })

  it("reports the edge set as incomplete so the UI can say so", () => {
    expect(buildEgoNetworkModel(network(), 2).edgesAreComplete).toBe(false)
  })

  it("marks every neighbour unlinked, but never the centre", () => {
    const model = buildEgoNetworkModel(network(), 2)

    expect(model.nodes.find((node) => node.id === "c-1")?.isUnlinked).toBeUndefined()
    expect(model.nodes.filter((node) => node.isUnlinked)).toHaveLength(2)
  })

  it("still returns every node — reachability is real information", () => {
    expect(buildEgoNetworkModel(network(), 2).nodes).toHaveLength(3)
  })
})

describe("nodes", () => {
  it("places the centre first and marks it as the focus", () => {
    const model = buildEgoNetworkModel(network(), 1)

    expect(model.nodes[0]).toMatchObject({ id: "c-1", label: "Aria Vane", isFocus: true })
    expect(model.focusId).toBe("c-1")
  })

  it("types the centre as a Character even though the projection omits labels", () => {
    // The Cypher matches `(c:Character)`, so the kind is known by construction.
    expect(buildEgoNetworkModel(network(), 1).nodes[0]?.kind).toBe("Character")
  })

  it("resolves each neighbour's kind from its Neo4j labels", () => {
    const model = buildEgoNetworkModel(network(), 1)

    expect(model.nodes[1]?.kind).toBe("Character")
    expect(model.nodes[2]?.kind).toBe("Location")
  })

  it("degrades an unrecognised label to Unknown rather than dropping the node", () => {
    const model = buildEgoNetworkModel(
      network({ neighbors: [{ id: "x-1", name: "Something", labels: ["Prophecy"] }] }),
      1,
    )

    expect(model.nodes[1]?.kind).toBe("Unknown")
  })

  it("handles a node with no labels", () => {
    const model = buildEgoNetworkModel(
      network({ neighbors: [{ id: "x-1", name: "Something", labels: [] }] }),
      1,
    )

    expect(model.nodes[1]?.kind).toBe("Unknown")
  })

  it("handles a character with no neighbours", () => {
    const model = buildEgoNetworkModel(network({ neighbors: [] }), 1)

    expect(model.nodes).toHaveLength(1)
    expect(model.edges).toEqual([])
    expect(model.edgesAreComplete).toBe(true)
  })

  it("drops a duplicate neighbour, which would corrupt the renderer's element set", () => {
    const model = buildEgoNetworkModel(
      network({
        neighbors: [
          { id: "c-2", name: "Roderic", labels: ["Character"] },
          { id: "c-2", name: "Roderic", labels: ["Character"] },
        ],
      }),
      1,
    )

    expect(model.nodes).toHaveLength(2)
    expect(model.edges).toHaveLength(1)
  })

  it("ignores a neighbour that is the centre itself", () => {
    const model = buildEgoNetworkModel(
      network({ neighbors: [{ id: "c-1", name: "Aria Vane", labels: ["Character"] }] }),
      1,
    )

    expect(model.nodes).toHaveLength(1)
    expect(model.edges).toEqual([])
  })
})

describe("edge identity", () => {
  it("derives edge ids from endpoints so repeat fetches produce the same ids", () => {
    const first = buildEgoNetworkModel(network(), 1)
    const second = buildEgoNetworkModel(network(), 1)

    expect(first.edges.map((edge) => edge.id)).toEqual(second.edges.map((edge) => edge.id))
    expect(first.edges[0]?.id).toBe("c-1->c-2")
  })

  it("leaves relType unset, since graph reads do not project relationship types", () => {
    expect(buildEgoNetworkModel(network(), 1).edges[0]?.relType).toBeUndefined()
  })
})
