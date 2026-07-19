/**
 * Graph interaction state — selection and reported viewport.
 *
 * Kept separate from the other kinds of state in play
 * (docs/frontend/STATE_MANAGEMENT.md):
 *
 *   | State                | Owner                          |
 *   |----------------------|--------------------------------|
 *   | Backend graph data   | TanStack Query                 |
 *   | Which graph to show  | URL search params              |
 *   | Selection            | **here** (React, view-scoped)  |
 *   | Editing              | `useGraphEditing`              |
 *   | Viewport (authority) | the renderer, internally       |
 *   | Viewport (display)   | **here**, mirrored read-only   |
 *   | Global app UI        | Zustand `ui-store`             |
 *
 * Three boundary decisions worth stating:
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
 * 3. **Selection is a list with a primary.** Several elements can be selected to
 *    frame them together, but exactly one — the most recent — is what the
 *    inspector describes. Keeping both readings in one place is what stops
 *    "which one did they mean" being re-decided at each call site.
 *
 * Selection is stored as id references, not node objects, so it cannot go stale
 * when the underlying data refetches — it is resolved against the current model
 * at read time.
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
  /** The primary selection, resolved against the current model. */
  selection: GraphSelection | null
  /** Every selected reference, in selection order. */
  selectedRefs: GraphElementRef[]
  /** The primary reference, for comparing without resolving. */
  primaryRef: GraphElementRef | null
  select: (refs: readonly GraphElementRef[]) => void
  selectOne: (ref: GraphElementRef | null) => void
  clearSelection: () => void
  /** The element currently under the pointer, if any. */
  hoveredRef: GraphElementRef | null
  /** Read-only mirror of the renderer's camera, for display. */
  viewport: GraphViewport
}

export interface GraphInteractionOptions {
  onActivate?: (ref: GraphElementRef) => void
  onContextMenu?: (target: { ref: GraphElementRef; position: { x: number; y: number } }) => void
  onBackgroundTap?: () => void
}

export function useGraphInteraction(
  renderer: GraphRenderer | null,
  model: GraphModel,
  options: GraphInteractionOptions = {},
): GraphInteraction {
  const [selectedRefs, setSelectedRefs] = useState<GraphElementRef[]>([])
  const [hoveredRef, setHoveredRef] = useState<GraphElementRef | null>(null)
  const [viewport, setViewport] = useState<GraphViewport>(DEFAULT_VIEWPORT)

  // Held in a ref so subscribing does not depend on handler identity — otherwise
  // every parent render would tear down and re-add renderer listeners. Synced in
  // an effect rather than during render: a ref write during render is not safe
  // under concurrent rendering, where a render may be discarded.
  const handlers = useRef(options)
  useEffect(() => {
    handlers.current = options
  }, [options])

  useEffect(() => {
    if (!renderer) return

    // Pure subscription. The renderer pushes its current viewport as soon as
    // anything moves it — including the initial `fit()` — so there is no need to
    // seed state from `getViewport()` here, which would be a synchronous
    // setState inside an effect and a cascading render for no benefit.
    const unsubscribers = [
      renderer.on("selectionChange", setSelectedRefs),
      renderer.on("viewportChange", setViewport),
      renderer.on("hoverChange", setHoveredRef),
      renderer.on("elementActivate", (ref) => handlers.current.onActivate?.(ref)),
      renderer.on("elementContextMenu", (target) => handlers.current.onContextMenu?.(target)),
      renderer.on("backgroundTap", () => handlers.current.onBackgroundTap?.()),
    ]

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [renderer])

  const select = useCallback(
    (refs: readonly GraphElementRef[]) => {
      // Command the renderer; its `selectionChange` event is what actually
      // updates state, so programmatic and user-driven selection travel the
      // identical path and cannot diverge.
      if (renderer) renderer.select(refs)
      else setSelectedRefs([...refs])
    },
    [renderer],
  )

  const selectOne = useCallback((ref: GraphElementRef | null) => select(ref ? [ref] : []), [select])

  const clearSelection = useCallback(() => select([]), [select])

  /** The most recent selection is the one the inspector speaks about. */
  const primaryRef = selectedRefs.at(-1) ?? null

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
    if (!primaryRef) return null

    if (primaryRef.element === "node") {
      const node = model.nodes.find((candidate) => candidate.id === primaryRef.id)
      return node ? { element: "node", node } : null
    }

    const edge = model.edges.find((candidate) => candidate.id === primaryRef.id)
    return edge ? { element: "edge", edge } : null
  }, [primaryRef, model])

  return {
    selection,
    selectedRefs,
    primaryRef,
    select,
    selectOne,
    clearSelection,
    hoveredRef,
    viewport,
  }
}
