/**
 * The Cytoscape implementation of `GraphRenderer`.
 *
 * **This file and its two siblings are the only places in the application that
 * import Cytoscape.** Everything above the engine speaks `GraphModel`,
 * `GraphElementRef`, and `GraphViewport`; swapping the library means writing a
 * peer of this file and changing one line in `engine/index.ts`.
 */

import cytoscape, {
  type Core,
  type EdgeSingular,
  type EventObject,
  type NodeSingular,
} from "cytoscape"

import { buildStylesheet } from "@/features/graph/engine/cytoscape/stylesheet"
import { toElements } from "@/features/graph/engine/cytoscape/to-elements"
import type {
  GraphRenderer,
  GraphRendererEvent,
  GraphRendererEventMap,
  GraphRendererOptions,
  Unsubscribe,
} from "@/features/graph/engine/renderer"
import type { GraphElementRef, GraphModel, GraphViewport } from "@/features/graph/model/graph.types"

/** Camera limits. Wide enough to explore, tight enough to never lose the graph. */
const ZOOM = { min: 0.1, max: 4, default: 1 } as const

/** Padding, in px, when framing the graph. */
const FIT_PADDING = 48

/**
 * Concentric layout: the focus node at the centre, everything else ringed
 * around it.
 *
 * This is *initial positioning*, not a layout system — the milestone explicitly
 * defers layout selection. Concentric is the right default for an ego network
 * specifically (it encodes "one thing in the middle, its neighbours around it"),
 * and unlike a force-directed layout it is deterministic, so the same network
 * renders identically on every visit and costs no simulation time. When layout
 * choice becomes a feature, it becomes an argument to this object.
 */
const LAYOUT = {
  name: "concentric",
  concentric: (node: NodeSingular) => (node.data("isFocus") ? 2 : 1),
  levelWidth: () => 1,
  minNodeSpacing: 44,
  padding: FIT_PADDING,
  animate: false,
  fit: true,
} as const

type Listeners = {
  [K in GraphRendererEvent]: Set<(payload: GraphRendererEventMap[K]) => void>
}

export function createCytoscapeRenderer(options: GraphRendererOptions): GraphRenderer {
  const listeners: Listeners = {
    selectionChange: new Set(),
    viewportChange: new Set(),
    elementActivate: new Set(),
  }

  const cy: Core = cytoscape({
    container: options.container,
    elements: [],
    style: buildStylesheet(),
    minZoom: ZOOM.min,
    maxZoom: ZOOM.max,
    // Box-select and multi-select are editing affordances; this view inspects
    // one element at a time, which keeps selection state a simple nullable.
    boxSelectionEnabled: false,
    selectionType: "single",
    // Panning and wheel-zoom are on by default; naming them documents that
    // viewport interaction is the renderer's job, not a component's.
    userPanningEnabled: true,
    userZoomingEnabled: true,
    // Nodes stay put: dragging them would imply a persisted position the
    // backend has no field for.
    autoungrabify: true,
  })

  let destroyed = false
  /** Guards against re-emitting selection while applying it programmatically. */
  let applyingSelection = false
  /** Set when a viewport event is already scheduled for this frame. */
  let viewportFrame: number | null = null
  let lastModelSignature = ""

  function emit<K extends GraphRendererEvent>(event: K, payload: GraphRendererEventMap[K]): void {
    for (const handler of listeners[event]) handler(payload)
  }

  function refOf(element: NodeSingular | EdgeSingular): GraphElementRef {
    return element.isNode()
      ? { element: "node", id: element.id() }
      : { element: "edge", id: element.id() }
  }

  function currentViewport(): GraphViewport {
    const pan = cy.pan()
    return { zoom: cy.zoom(), pan: { x: pan.x, y: pan.y } }
  }

  /* ------------------------------------------------------------- wiring in */

  cy.on("select", "node, edge", (event: EventObject) => {
    if (applyingSelection) return
    emit("selectionChange", refOf(event.target as NodeSingular | EdgeSingular))
  })

  cy.on("unselect", "node, edge", () => {
    if (applyingSelection) return
    // Cytoscape unselects the previous element before selecting the next, so a
    // bare unselect is only a real deselection once nothing remains selected.
    if (cy.$(":selected").length === 0) emit("selectionChange", null)
  })

  // Clicking empty canvas clears selection — the expected escape from a
  // selected state, and the reason `selectionChange` carries null.
  cy.on("tap", (event: EventObject) => {
    if (event.target === cy) {
      cy.$(":selected").unselect()
    }
  })

  cy.on("dbltap", "node, edge", (event: EventObject) => {
    emit("elementActivate", refOf(event.target as NodeSingular | EdgeSingular))
  })

  /**
   * Viewport events fire per animation frame during a drag or wheel-zoom.
   * Coalescing to one emit per frame keeps React out of the interaction's hot
   * path — without it, every pixel of a pan would schedule a re-render.
   */
  cy.on("viewport", () => {
    if (viewportFrame !== null) return
    viewportFrame = requestAnimationFrame(() => {
      viewportFrame = null
      if (!destroyed) emit("viewportChange", currentViewport())
    })
  })

  /* ------------------------------------------------------------- the shape */

  return {
    setModel(model: GraphModel) {
      if (destroyed) return

      // Re-running the layout resets the camera, so it is only worth doing when
      // the graph actually changed. A refetch that returns the same network
      // should leave the user exactly where they were.
      const signature = modelSignature(model)
      if (signature === lastModelSignature) return
      const isFirstModel = lastModelSignature === ""
      lastModelSignature = signature

      cy.batch(() => {
        cy.elements().remove()
        cy.add(toElements(model))
      })

      cy.layout(LAYOUT).run()
      // `layout.fit` frames the graph; only the very first model should also
      // reset zoom, which `fit` already does.
      if (isFirstModel) cy.fit(undefined, FIT_PADDING)
    },

    select(ref) {
      if (destroyed) return
      applyingSelection = true
      cy.$(":selected").unselect()
      if (ref) {
        const element = cy.getElementById(ref.id)
        if (element.nonempty()) element.select()
      }
      applyingSelection = false
      emit("selectionChange", ref)
    },

    zoomBy(factor) {
      if (destroyed) return
      const next = clamp(cy.zoom() * factor, ZOOM.min, ZOOM.max)
      // Zoom about the viewport centre rather than the origin, so the thing the
      // user is looking at stays where they are looking.
      cy.zoom({
        level: next,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      })
    },

    fit() {
      if (destroyed || cy.elements().length === 0) return
      cy.fit(undefined, FIT_PADDING)
    },

    resetViewport() {
      if (destroyed) return
      if (cy.elements().length === 0) {
        cy.zoom(ZOOM.default)
        cy.pan({ x: 0, y: 0 })
        return
      }
      cy.fit(undefined, FIT_PADDING)
    },

    resize() {
      if (destroyed) return
      cy.resize()
    },

    getViewport: currentViewport,

    on(event, handler) {
      const set = listeners[event] as Set<typeof handler>
      set.add(handler)
      const unsubscribe: Unsubscribe = () => {
        set.delete(handler)
      }
      return unsubscribe
    },

    destroy() {
      if (destroyed) return
      destroyed = true
      if (viewportFrame !== null) cancelAnimationFrame(viewportFrame)
      for (const key of Object.keys(listeners) as GraphRendererEvent[]) listeners[key].clear()
      cy.destroy()
    },
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * A cheap identity for a rendered graph.
 *
 * Ids only: node labels and kinds can change without altering the topology, and
 * it is topology that determines whether the layout must be recomputed.
 */
function modelSignature(model: GraphModel): string {
  return `${model.nodes.map((node) => node.id).join(",")}|${model.edges
    .map((edge) => edge.id)
    .join(",")}`
}
