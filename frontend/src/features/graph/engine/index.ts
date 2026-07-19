/**
 * The engine's public surface — and the single swap point.
 *
 * Callers ask for *a* renderer; they never name Cytoscape. Changing the drawing
 * library is changing the right-hand side of one assignment in this file, plus
 * adding a peer of `cytoscape/cytoscape-renderer.ts`. Nothing else in the
 * application references either.
 */

import { createCytoscapeRenderer } from "@/features/graph/engine/cytoscape/cytoscape-renderer"
import type { GraphRendererFactory } from "@/features/graph/engine/renderer"

/** The renderer the app currently uses. */
export const createGraphRenderer: GraphRendererFactory = createCytoscapeRenderer

export type {
  GraphRenderer,
  GraphRendererEvent,
  GraphRendererEventMap,
  GraphRendererFactory,
  GraphRendererOptions,
  Unsubscribe,
} from "@/features/graph/engine/renderer"
