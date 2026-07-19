/**
 * Graph interaction state — selection and reported viewport.
 *
 * Kept separate from the four other kinds of state in play
 * (docs/frontend/STATE_MANAGEMENT.md):
 *
 *   | State                | Owner                          |
 *   |----------------------|--------------------------------|
 *   | Backend graph data   | TanStack Query                 |
 *   | Which graph to show  | URL search params              |
 *   | Selection            | **here** (React, view-scoped)  |
 *   | Viewport (authority) | the renderer, internally       |
 *   | Viewport (display)   | **here**, mirrored read-only   |
 *   | Global app UI        | Zustand `ui-store`             |
 *
 * Two boundary decisions worth stating:
 *
 * 1. **Selection is not global.** It is meaningless outside this workspace and
 *    dies with it, so it is component state — not the Zustand store, which
 *    STATE_MANAGEMENT reserves for genuinely app-wide UI concerns.
 *
 * 2. **The renderer remains the viewport's authority.** What is mirrored here is
 *    a read-only projection for display; nothing feeds it back into the
 *    renderer. Making React the source of truth for pan/zoom would fight the
 *    library's own animation loop and stutter every drag.
 *
 * Selection is stored as an id reference, not a node object, so it cannot go
 * stale when the underlying data refetches — it is resolved against the current
 * model at read time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { GraphRenderer } from "@/features/graph/engine"
import {
  DEFAULT_VIEWPORT,
  type GraphElementRef,
  type GraphModel,
  type GraphSelection,
  type GraphViewport,
} from "@/features/graph/model/graph.types"

export interface GraphInteraction {
  /** The live selection, resolved against the current model. */
  selection: GraphSelection | null
  /** Raw reference, for comparing without resolving. */
  selectedRef: GraphElementRef | null
  select: (ref: GraphElementRef | null) => void
  clearSelection: () => void
  /** Read-only mirror of the renderer's camera, for display. */
  viewport: GraphViewport
}

export function useGraphInteraction(
  renderer: GraphRenderer | null,
  model: GraphModel,
  options: { onActivate?: (ref: GraphElementRef) => void } = {},
): GraphInteraction {
  const [selectedRef, setSelectedRef] = useState<GraphElementRef | null>(null)
  const [viewport, setViewport] = useState<GraphViewport>(DEFAULT_VIEWPORT)

  // Held in a ref so subscribing does not depend on the handler's identity —
  // otherwise every parent render would tear down and re-add renderer listeners.
  // Synced in an effect rather than during render: a ref write during render is
  // not safe under concurrent rendering, where a render may be discarded.
  const onActivate = useRef(options.onActivate)
  useEffect(() => {
    onActivate.current = options.onActivate
  }, [options.onActivate])

  useEffect(() => {
    if (!renderer) return

    // Pure subscription. The renderer pushes its current viewport as soon as
    // anything moves it — including the initial `fit()` — so there is no need to
    // seed state from `getViewport()` here, which would be a synchronous
    // setState inside an effect and a cascading render for no benefit.
    const unsubscribers = [
      renderer.on("selectionChange", setSelectedRef),
      renderer.on("viewportChange", setViewport),
      renderer.on("elementActivate", (ref) => onActivate.current?.(ref)),
    ]

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [renderer])

  const select = useCallback(
    (ref: GraphElementRef | null) => {
      // Command the renderer; its `selectionChange` event is what actually
      // updates state, so programmatic and user-driven selection travel the
      // identical path and cannot diverge.
      if (renderer) renderer.select(ref)
      else setSelectedRef(ref)
    },
    [renderer],
  )

  const clearSelection = useCallback(() => select(null), [select])

  /**
   * Resolve the reference against the current model.
   *
   * This is also what handles staleness: when the model changes to one that no
   * longer contains the selected element, the lookup simply finds nothing and
   * the selection reads as null. Deriving it beats an effect that watches the
   * model and clears the ref — same outcome, no extra render pass, no window
   * during which the inspector describes a node that is no longer on screen.
   */
  const selection = useMemo<GraphSelection | null>(() => {
    if (!selectedRef) return null

    if (selectedRef.element === "node") {
      const node = model.nodes.find((candidate) => candidate.id === selectedRef.id)
      return node ? { element: "node", node } : null
    }

    const edge = model.edges.find((candidate) => candidate.id === selectedRef.id)
    return edge ? { element: "edge", edge } : null
  }, [selectedRef, model])

  return { selection, selectedRef, select, clearSelection, viewport }
}
