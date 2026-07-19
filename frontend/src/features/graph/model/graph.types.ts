/**
 * The Graph subsystem's domain vocabulary — renderer-agnostic by construction.
 *
 * Nothing in this file knows Cytoscape exists, and nothing outside
 * `engine/cytoscape/` may import Cytoscape. These types are the language the
 * services, queries, state, and components all speak; the renderer translates
 * them at its own boundary. That is what makes the drawing library swappable
 * (docs/frontend/FRONTEND_ARCHITECTURE.md §7.3).
 */

import type { NodeKind } from "@/shared/domain/entity-kinds"

/** One node in the rendered graph. */
export interface GraphNode {
  id: string
  label: string
  kind: NodeKind
  /**
   * True for the node the view is built around (the ego-network centre).
   * Rendering emphasises it; nothing else depends on it.
   */
  isFocus?: boolean
  /**
   * Whether this node's connections are known.
   *
   * The backend's ego-network response returns *reachable nodes* but no
   * relationships (see `services/build-graph-model.ts`). A node that is reachable
   * but whose edges we cannot verify is marked here, so the renderer can show it
   * honestly rather than implying a connection that was never reported.
   */
  isUnlinked?: boolean
}

/**
 * One edge in the rendered graph.
 *
 * `relType` stays optional because it is only known when the backend projects
 * relationships. Against an endpoint that reports reachable nodes alone, an
 * edge can be inferred at depth 1 but its type cannot — so a typeless edge
 * means "connected, kind unknown", not "untyped relationship".
 *
 * `sentiment` is carried only by `KNOWS` edges.
 */
export interface GraphEdge {
  id: string
  source: string
  target: string
  relType?: string
  sentiment?: string
}

/**
 * A complete graph ready to render.
 *
 * `edgesAreComplete` is deliberately part of the model rather than a rendering
 * detail: whether the edge set is trustworthy is a *fact about the data*, and
 * every consumer — renderer, inspector, and the notice shown to the user — needs
 * to agree on it.
 */
export interface GraphModel {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** The node the view is centred on, if any. */
  focusId?: string
  /**
   * False when the backend reported nodes without the relationships connecting
   * them, so the absence of an edge means "not reported", not "not connected".
   */
  edgesAreComplete: boolean
}

export const EMPTY_GRAPH_MODEL: GraphModel = {
  nodes: [],
  edges: [],
  edgesAreComplete: true,
}

/* --------------------------------------------------------------- selection */

/**
 * A reference to something selectable.
 *
 * A discriminated union rather than a bare id: nodes and edges can share an id
 * space, and every consumer needs to know which kind it is holding without
 * looking it up.
 */
export type GraphElementRef = { element: "node"; id: string } | { element: "edge"; id: string }

/** The resolved selection, carrying the data the inspector needs. */
export type GraphSelection =
  { element: "node"; node: GraphNode } | { element: "edge"; edge: GraphEdge }

/* ----------------------------------------------------------------- editing */

/**
 * How an in-progress edit should *look*.
 *
 * Deliberately a description of appearance, not of behaviour: the renderer is
 * told which node is the origin, which nodes may legally receive the connection,
 * and which one is currently being previewed. It is not told what a relationship
 * is, which types exist, or what happens on confirm — all of that stays in
 * `state/useGraphEditing.ts` and `shared/relationships/`.
 *
 * That split is what keeps editing logic independent of the drawing library. A
 * different renderer implements this by painting differently; none of the rules
 * about what may connect to what move with it.
 */
export interface GraphEditingVisual {
  /** The node the connection is being drawn from. */
  sourceId: string
  /**
   * Nodes that may legally receive it. Everything else is dimmed, so "invalid"
   * is communicated by absence rather than by a second list.
   */
  validTargetIds: readonly string[]
  /** The valid target currently under the pointer, if any. */
  previewTargetId?: string
}

/** A point in viewport (screen) coordinates — where the pointer was. */
export interface GraphPoint {
  x: number
  y: number
}

/* ---------------------------------------------------------------- viewport */

/**
 * Camera state, in the renderer's coordinate space.
 *
 * Reported *out* of the renderer for display; never the source of truth for
 * drawing. Mirroring pan/zoom into React state and feeding it back would fight
 * the renderer's own animation loop on every wheel tick.
 */
export interface GraphViewport {
  zoom: number
  pan: { x: number; y: number }
}

export const DEFAULT_VIEWPORT: GraphViewport = { zoom: 1, pan: { x: 0, y: 0 } }
