/**
 * Public surface of the `graph` subsystem.
 *
 * Deliberately minimal: the workspace page, and the renderer contract for
 * anyone who needs to reason about the engine boundary. Nothing internal —
 * no Cytoscape, no renderer implementation, no model builders — is exported,
 * which is what keeps the drawing library replaceable from outside.
 */

export type { GraphRenderer, GraphRendererFactory } from "@/features/graph/engine"
export type {
  GraphEdge,
  GraphElementRef,
  GraphModel,
  GraphNode,
  GraphSelection,
  GraphViewport,
} from "@/features/graph/model/graph.types"
export { GraphExplorerPage } from "@/features/graph/pages/GraphExplorerPage"
export { ShortestPathPage } from "@/features/graph/pages/ShortestPathPage"
