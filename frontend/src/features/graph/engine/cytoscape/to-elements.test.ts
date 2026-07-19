/**
 * The translation boundary into Cytoscape's element shape.
 *
 * Pure, so it is testable without a DOM or a canvas — which is the point of
 * keeping it separate from the renderer.
 */

import { describe, expect, it } from "vitest"

import { toElements } from "@/features/graph/engine/cytoscape/to-elements"
import type { GraphModel } from "@/features/graph/model/graph.types"

const model: GraphModel = {
  nodes: [
    { id: "c-1", label: "Aria Vane", kind: "Character", isFocus: true },
    { id: "l-1", label: "Dunhollow", kind: "Location" },
  ],
  edges: [{ id: "c-1->l-1", source: "c-1", target: "l-1" }],
  focusId: "c-1",
  edgesAreComplete: true,
}

describe("toElements", () => {
  it("emits nodes before edges, so edge endpoints already exist", () => {
    const elements = toElements(model)

    expect(elements.map((element) => element.group)).toEqual(["nodes", "nodes", "edges"])
  })

  it("puts style-driving fields in data, where Cytoscape selectors can reach them", () => {
    const [focus] = toElements(model)

    expect(focus?.data).toMatchObject({
      id: "c-1",
      label: "Aria Vane",
      kind: "Character",
      isFocus: true,
    })
  })

  it("omits false flags rather than emitting them", () => {
    // `[?field]` tests truthiness; omitting keeps payloads small on large graphs.
    const [, plain] = toElements(model)

    expect(plain?.data).not.toHaveProperty("isFocus")
    expect(plain?.data).not.toHaveProperty("isUnlinked")
  })

  it("marks unlinked nodes so the stylesheet can render them honestly", () => {
    const [node] = toElements({
      ...model,
      nodes: [{ id: "x", label: "X", kind: "Event", isUnlinked: true }],
      edges: [],
    })

    expect(node?.data.isUnlinked).toBe(true)
  })

  it("carries edge endpoints through unchanged", () => {
    const edge = toElements(model).at(-1)

    expect(edge?.data).toMatchObject({ id: "c-1->l-1", source: "c-1", target: "l-1" })
  })

  it("omits relType while the backend does not report it", () => {
    expect(toElements(model).at(-1)?.data).not.toHaveProperty("relType")
  })

  it("includes relType once an edge carries one", () => {
    const elements = toElements({
      ...model,
      edges: [{ id: "e", source: "c-1", target: "l-1", relType: "LOCATED_IN" }],
    })

    expect(elements.at(-1)?.data.relType).toBe("LOCATED_IN")
  })

  it("produces nothing for an empty model", () => {
    expect(toElements({ nodes: [], edges: [], edgesAreComplete: true })).toEqual([])
  })
})
