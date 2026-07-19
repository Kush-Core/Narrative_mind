/**
 * `GraphModel` → Cytoscape element definitions.
 *
 * The translation boundary, kept as a pure function so it is testable without a
 * DOM, a canvas, or a Cytoscape instance. Everything Cytoscape-shaped about the
 * data lives here; everything above works in the subsystem's own vocabulary.
 */

import type { ElementDefinition } from "cytoscape"

import type { GraphModel } from "@/features/graph/model/graph.types"

/**
 * Cytoscape selectors match on `data`, so the flags the stylesheet keys off
 * (`kind`, `isFocus`, `isUnlinked`) must be data fields, not classes.
 *
 * Booleans are emitted only when true: Cytoscape's `[?field]` selector tests
 * truthiness, and omitting the key keeps the element payload minimal for large
 * graphs.
 */
export function toElements(model: GraphModel): ElementDefinition[] {
  const nodes: ElementDefinition[] = model.nodes.map((node) => ({
    group: "nodes",
    data: {
      id: node.id,
      label: node.label,
      kind: node.kind,
      ...(node.isFocus ? { isFocus: true } : {}),
      ...(node.isUnlinked ? { isUnlinked: true } : {}),
    },
  }))

  const edges: ElementDefinition[] = model.edges.map((edge) => ({
    group: "edges",
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.relType ? { relType: edge.relType } : {}),
    },
  }))

  return [...nodes, ...edges]
}
