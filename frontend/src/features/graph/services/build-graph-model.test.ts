/**
 * The model builder — where an edge either is a fact or is not drawn.
 *
 * These are the most important tests in the subsystem. The builder decides
 * whether an edge is asserted, and asserting one that was never reported would
 * make the graph confidently wrong. Both response shapes are pinned here: the
 * projected edge list the backend returns today, and the node-only response it
 * used to return, which is still the only case where adjacency is inferred.
 */

import { describe, expect, it } from "vitest"

import type { CharacterNetwork } from "@/features/graph/model/graph.schema"
import { buildEgoNetworkModel } from "@/features/graph/services/build-graph-model"

type ProjectedRelationship = NonNullable<CharacterNetwork["relationships"]>[number]

/** One projected edge. `sentiment` is spelled out so call sites need not. */
function rel(
  source: string,
  target: string,
  relType: string,
  sentiment?: string,
): ProjectedRelationship {
  return { source, target, relType, sentiment }
}

/** A response from a backend that projects relationships. */
function network(overrides: Partial<CharacterNetwork> = {}): CharacterNetwork {
  return {
    center: { id: "c-1", name: "Aria Vane" },
    neighbors: [
      { id: "c-2", name: "Roderic", labels: ["Character"] },
      { id: "l-1", name: "Dunhollow", labels: ["Location"] },
    ],
    relationships: [rel("c-1", "c-2", "KNOWS", "hostile"), rel("c-1", "l-1", "LOCATED_IN")],
    ...overrides,
  }
}

/**
 * A response from a backend that predates edge projection. `relationships: null`
 * is the signal — distinct from `[]`, which means "projected, and there are
 * none".
 */
function legacyNetwork(overrides: Partial<CharacterNetwork> = {}): CharacterNetwork {
  return network({ relationships: null, ...overrides })
}

describe("projected relationships — edges are facts at any depth", () => {
  it("uses the reported edge list verbatim", () => {
    const model = buildEgoNetworkModel(network(), 1)

    expect(model.edges.map((edge) => [edge.source, edge.target, edge.relType])).toEqual([
      ["c-1", "c-2", "KNOWS"],
      ["c-1", "l-1", "LOCATED_IN"],
    ])
  })

  it("carries relationship type and sentiment onto the edge", () => {
    const model = buildEgoNetworkModel(network(), 1)

    expect(model.edges[0]).toMatchObject({ relType: "KNOWS", sentiment: "hostile" })
    expect(model.edges[1]?.sentiment).toBeUndefined()
  })

  it("reports the edge set as complete even at depth > 1", () => {
    // This is the whole point of the backend projecting edges: depth no longer
    // determines whether the graph can be drawn honestly.
    expect(buildEgoNetworkModel(network(), 3).edgesAreComplete).toBe(true)
  })

  it("does not mark nodes unlinked at depth > 1", () => {
    const model = buildEgoNetworkModel(network(), 3)
    expect(model.nodes.every((node) => !node.isUnlinked)).toBe(true)
  })

  it("keeps edges between two neighbours, not just edges from the centre", () => {
    // The induced subgraph includes lateral edges; a star-only model would drop
    // this one and misrepresent the shape of the network.
    const model = buildEgoNetworkModel(
      network({
        relationships: [rel("c-2", "l-1", "LOCATED_IN")],
      }),
      2,
    )

    expect(model.edges).toHaveLength(1)
    expect(model.edges[0]).toMatchObject({ source: "c-2", target: "l-1" })
  })

  it("distinguishes an empty edge list from an absent one", () => {
    const model = buildEgoNetworkModel(network({ relationships: [] }), 2)

    expect(model.edges).toEqual([])
    // Empty *and* complete: the backend looked and there is nothing there.
    expect(model.edgesAreComplete).toBe(true)
  })

  it("drops an edge whose endpoint was never reported as a node", () => {
    // Cytoscape throws on an edge referencing a missing node, so a half-anchored
    // edge must not reach the renderer.
    const model = buildEgoNetworkModel(
      network({ relationships: [rel("c-1", "ghost", "KNOWS")] }),
      1,
    )

    expect(model.edges).toEqual([])
  })

  it("keeps two relationships of different types between the same pair", () => {
    const model = buildEgoNetworkModel(
      network({
        relationships: [rel("c-1", "c-2", "KNOWS"), rel("c-1", "c-2", "MEMBER_OF")],
      }),
      1,
    )

    // Identity includes the type; without that the second would replace the
    // first and one relationship would silently vanish.
    expect(model.edges).toHaveLength(2)
    expect(model.edges.map((edge) => edge.id)).toEqual(["c-1-KNOWS->c-2", "c-1-MEMBER_OF->c-2"])
  })

  it("drops an exact duplicate edge", () => {
    const model = buildEgoNetworkModel(
      network({
        relationships: [rel("c-1", "c-2", "KNOWS"), rel("c-1", "c-2", "KNOWS")],
      }),
      1,
    )

    expect(model.edges).toHaveLength(1)
  })
})

describe("no projected relationships — the legacy inference", () => {
  it("draws centre→neighbour edges at depth 1, where adjacency is a fact", () => {
    const model = buildEgoNetworkModel(legacyNetwork(), 1)

    expect(model.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ["c-1", "c-2"],
      ["c-1", "l-1"],
    ])
    expect(model.edgesAreComplete).toBe(true)
  })

  it("leaves relType unset — connectedness is known, the kind is not", () => {
    expect(buildEgoNetworkModel(legacyNetwork(), 1).edges[0]?.relType).toBeUndefined()
  })

  it("draws no edges at all at depth > 1 rather than inventing them", () => {
    expect(buildEgoNetworkModel(legacyNetwork(), 2).edges).toEqual([])
    expect(buildEgoNetworkModel(legacyNetwork(), 3).edges).toEqual([])
  })

  it("reports the edge set as incomplete so the UI can say so", () => {
    expect(buildEgoNetworkModel(legacyNetwork(), 2).edgesAreComplete).toBe(false)
  })

  it("marks every neighbour unlinked, but never the centre", () => {
    const model = buildEgoNetworkModel(legacyNetwork(), 2)

    expect(model.nodes.find((node) => node.id === "c-1")?.isUnlinked).toBeUndefined()
    expect(model.nodes.filter((node) => node.isUnlinked)).toHaveLength(2)
  })

  it("still returns every node — reachability is real information", () => {
    expect(buildEgoNetworkModel(legacyNetwork(), 2).nodes).toHaveLength(3)
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
      network({
        neighbors: [{ id: "x-1", name: "Something", labels: ["Prophecy"] }],
        relationships: [],
      }),
      1,
    )

    expect(model.nodes[1]?.kind).toBe("Unknown")
  })

  it("handles a node with no labels", () => {
    const model = buildEgoNetworkModel(
      network({
        neighbors: [{ id: "x-1", name: "Something", labels: [] }],
        relationships: [],
      }),
      1,
    )

    expect(model.nodes[1]?.kind).toBe("Unknown")
  })

  it("handles a character with no neighbours", () => {
    const model = buildEgoNetworkModel(network({ neighbors: [], relationships: [] }), 1)

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
        relationships: [rel("c-1", "c-2", "KNOWS")],
      }),
      1,
    )

    expect(model.nodes).toHaveLength(2)
    expect(model.edges).toHaveLength(1)
  })

  it("ignores a neighbour that is the centre itself", () => {
    const model = buildEgoNetworkModel(
      network({
        neighbors: [{ id: "c-1", name: "Aria Vane", labels: ["Character"] }],
        relationships: [],
      }),
      1,
    )

    expect(model.nodes).toHaveLength(1)
    expect(model.edges).toEqual([])
  })
})

describe("edge identity", () => {
  it("derives edge ids deterministically so repeat fetches produce the same ids", () => {
    const first = buildEgoNetworkModel(network(), 1)
    const second = buildEgoNetworkModel(network(), 1)

    expect(first.edges.map((edge) => edge.id)).toEqual(second.edges.map((edge) => edge.id))
    expect(first.edges[0]?.id).toBe("c-1-KNOWS->c-2")
  })

  it("omits the type from the id when there is none to include", () => {
    expect(buildEgoNetworkModel(legacyNetwork(), 1).edges[0]?.id).toBe("c-1->c-2")
  })
})
