/**
 * The Cytoscape implementation of `GraphRenderer`.
 *
 * **This file and its two siblings are the only places in the application that
 * import Cytoscape.** Everything above the engine speaks `GraphModel`,
 * `GraphElementRef`, `GraphEditingVisual`, and `GraphViewport`; swapping the
 * library means writing a peer of this file and changing one line in
 * `engine/index.ts`.
 *
 * Note what this file does *not* contain: any notion of what a relationship is,
 * which pairings are legal, or what happens when an edit is confirmed. It is
 * told which node is an edit's origin and which nodes may receive it, and it
 * paints that. The rules live in `shared/domain/relationships.ts`, the workflow
 * in `state/useGraphEditing.ts`.
 */

import cytoscape, {
  type Collection,
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
import type {
  GraphEditingVisual,
  GraphElementRef,
  GraphModel,
  GraphViewport,
} from "@/features/graph/model/graph.types"

/** Camera limits. Wide enough to explore, tight enough to never lose the graph. */
const ZOOM = { min: 0.1, max: 4, default: 1 } as const

/** Padding, in px, when framing the graph. */
const FIT_PADDING = 48

/**
 * Duration for programmatic camera moves.
 *
 * Short enough not to feel like waiting, long enough that the eye can follow
 * where the graph went — which is the entire reason to animate rather than jump.
 * User-driven pan and wheel-zoom are never animated; the library tracks the
 * pointer directly and interposing a tween would add lag to a direct
 * manipulation.
 */
const CAMERA_ANIMATION_MS = 220

/** The id of the transient edge drawn while previewing a connection. */
const PREVIEW_EDGE_ID = "__preview__"

/** Classes the stylesheet keys off for editing feedback. */
const EDIT_CLASS = {
  source: "edit-source",
  valid: "edit-valid",
  invalid: "edit-invalid",
  hovered: "is-hovered",
} as const

/**
 * Concentric layout: the focus node at the centre, everything else ringed
 * around it.
 *
 * This is *initial positioning*, not a layout system — layout selection remains
 * deferred. Concentric is the right default for an ego network specifically (it
 * encodes "one thing in the middle, its neighbours around it"), and unlike a
 * force-directed layout it is deterministic, so the same network renders
 * identically on every visit and costs no simulation time. When layout choice
 * becomes a feature, it becomes an argument to this object.
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
    hoverChange: new Set(),
    elementContextMenu: new Set(),
    backgroundTap: new Set(),
  }

  const cy: Core = cytoscape({
    container: options.container,
    elements: [],
    style: buildStylesheet(),
    minZoom: ZOOM.min,
    maxZoom: ZOOM.max,
    // Box-select (shift-drag) and additive click (shift-click) let a reader
    // frame a subset of a large network. `selectionType: "single"` keeps a plain
    // click replacing the selection, which is the predictable default.
    boxSelectionEnabled: true,
    selectionType: "single",
    // Panning and wheel-zoom are on by default; naming them documents that
    // viewport interaction is the renderer's job, not a component's.
    userPanningEnabled: true,
    userZoomingEnabled: true,
    // Nodes stay put: dragging them would imply a persisted position the
    // backend has no field for. It also leaves the drag gesture unclaimed,
    // which is why connecting is a click sequence rather than a drag.
    autoungrabify: true,
  })

  let destroyed = false
  /** Guards against re-emitting selection while applying it programmatically. */
  let applyingSelection = false
  /** Set when a viewport event is already scheduled for this frame. */
  let viewportFrame: number | null = null
  /** Coalesces Cytoscape's per-element select/unselect into one emit. */
  let selectionFrame: number | null = null
  let lastNodeSignature = ""
  let lastEdgeSignature = ""
  let editingVisual: GraphEditingVisual | null = null

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

  /** The preview edge is ours, not the model's — never report it as selection. */
  function isInternal(element: NodeSingular | EdgeSingular): boolean {
    return element.id() === PREVIEW_EDGE_ID
  }

  /**
   * Report the current selection, once per frame.
   *
   * Cytoscape unselects the outgoing element before selecting the incoming one,
   * so a plain click fires unselect-then-select. Emitting on each would push an
   * empty selection through React between the two, and anything watching the
   * selection would flicker.
   */
  function scheduleSelectionEmit(): void {
    if (applyingSelection || selectionFrame !== null) return
    selectionFrame = requestAnimationFrame(() => {
      selectionFrame = null
      if (destroyed) return
      applyPendingAdditive()
      emit("selectionChange", readSelection())
    })
  }

  function readSelection(): GraphElementRef[] {
    return cy
      .$(":selected")
      .filter((element) => !isInternal(element))
      .map((element) => refOf(element))
  }

  function resolve(refs: readonly GraphElementRef[]): Collection {
    return refs.reduce<Collection>(
      (collection, ref) => collection.union(cy.getElementById(ref.id)),
      cy.collection(),
    )
  }

  /* ------------------------------------------------------------- wiring in */

  cy.on("select unselect", "node, edge", scheduleSelectionEmit)

  /**
   * Additive selection on a modifier click.
   *
   * Cytoscape's `selectionType: "single"` replaces the selection on every tap,
   * modifier or not — shift only adds for *box* selection. A plain click should
   * keep replacing (that is the predictable default), so the modifier case is
   * restored by hand.
   *
   * The timing is the whole difficulty. Cytoscape applies its own selection
   * change **after** the `tap` handler runs — verified by instrumenting the
   * event order: `tapstart → tap → unselect → select`. Restoring the previous
   * selection inside `tap` would therefore be undone a moment later. So the
   * intent is recorded at `tapstart` (where the modifier is still on the
   * originating mouse event) and applied in the same animation frame that
   * already coalesces the outgoing event, by which point the library has
   * settled.
   *
   * Toggling off is included because a selection you cannot subtract from is a
   * selection you have to clear and rebuild.
   */
  let pendingAdditive: { before: string[]; id: string } | null = null

  cy.on("tapstart", "node, edge", (event: EventObject) => {
    const original = event.originalEvent as MouseEvent | undefined
    const additive = Boolean(original?.shiftKey || original?.metaKey || original?.ctrlKey)
    const element = event.target as NodeSingular | EdgeSingular

    pendingAdditive =
      additive && !isInternal(element)
        ? { before: cy.$(":selected").map((selected) => selected.id()), id: element.id() }
        : null
  })

  /** Re-apply an additive intent once the library's own change has landed. */
  function applyPendingAdditive(): void {
    if (!pendingAdditive) return
    const { before, id } = pendingAdditive
    pendingAdditive = null

    // Guarded: these calls fire select/unselect, which must not schedule a
    // second emit while we are mid-adjustment.
    applyingSelection = true
    const wasSelected = before.includes(id)
    for (const previous of before) {
      if (previous !== id) cy.getElementById(previous).select()
    }
    if (wasSelected) cy.getElementById(id).unselect()
    applyingSelection = false
  }

  cy.on("tap", (event: EventObject) => {
    if (event.target !== cy) return
    // Clicking empty canvas clears selection — the expected escape from a
    // selected state.
    cy.$(":selected").unselect()
    emit("backgroundTap", { x: event.renderedPosition.x, y: event.renderedPosition.y })
  })

  cy.on("dbltap", "node, edge", (event: EventObject) => {
    const element = event.target as NodeSingular | EdgeSingular
    if (isInternal(element)) return
    emit("elementActivate", refOf(element))
  })

  cy.on("cxttap", "node, edge", (event: EventObject) => {
    const element = event.target as NodeSingular | EdgeSingular
    if (isInternal(element)) return
    emit("elementContextMenu", {
      ref: refOf(element),
      position: { x: event.renderedPosition.x, y: event.renderedPosition.y },
    })
  })

  /**
   * Hover is painted here and reported upward.
   *
   * Painting it locally keeps a pointer-frequency concern out of React
   * entirely; reporting it lets the application drive things that are *about*
   * the hovered element rather than its appearance — the connection preview
   * being the reason it exists.
   */
  cy.on("mouseover", "node, edge", (event: EventObject) => {
    const element = event.target as NodeSingular | EdgeSingular
    if (isInternal(element)) return
    element.addClass(EDIT_CLASS.hovered)
    options.container.style.cursor = "pointer"
    emit("hoverChange", refOf(element))
  })

  cy.on("mouseout", "node, edge", (event: EventObject) => {
    const element = event.target as NodeSingular | EdgeSingular
    element.removeClass(EDIT_CLASS.hovered)
    options.container.style.cursor = ""
    if (!isInternal(element)) emit("hoverChange", null)
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

  /* --------------------------------------------------------------- editing */

  function clearEditingClasses(): void {
    cy.elements().removeClass([EDIT_CLASS.source, EDIT_CLASS.valid, EDIT_CLASS.invalid].join(" "))
    cy.getElementById(PREVIEW_EDGE_ID).remove()
  }

  /**
   * Repaint the editing decoration from the stored visual.
   *
   * Factored out because it must run both when the visual changes *and* after
   * `setModel` replaces elements — otherwise starting a connection and then
   * receiving a refetch would leave the graph looking idle mid-edit.
   */
  function applyEditingVisual(): void {
    clearEditingClasses()
    if (!editingVisual) return

    const source = cy.getElementById(editingVisual.sourceId)
    if (source.empty()) return

    const valid = cy.collection().union(source)
    for (const id of editingVisual.validTargetIds) {
      valid.merge(cy.getElementById(id))
    }

    source.addClass(EDIT_CLASS.source)
    for (const id of editingVisual.validTargetIds) {
      cy.getElementById(id).addClass(EDIT_CLASS.valid)
    }
    // Everything that is neither the origin nor a legal destination — including
    // every edge — recedes, so "invalid" reads as absence rather than as an
    // extra colour competing with the valid ones.
    cy.elements().difference(valid).addClass(EDIT_CLASS.invalid)

    const previewId = editingVisual.previewTargetId
    if (previewId && cy.getElementById(previewId).nonempty()) {
      cy.add({
        group: "edges",
        data: { id: PREVIEW_EDGE_ID, source: editingVisual.sourceId, target: previewId },
        // Not selectable: it is feedback, not part of the graph.
        selectable: false,
        grabbable: false,
      })
    }
  }

  /* ------------------------------------------------------------- the shape */

  return {
    setModel(model: GraphModel) {
      if (destroyed) return

      const nodeSignature = model.nodes.map((node) => node.id).join(",")
      const edgeSignature = model.edges.map((edge) => edge.id).join(",")
      if (nodeSignature === lastNodeSignature && edgeSignature === lastEdgeSignature) return

      const isFirstModel = lastNodeSignature === "" && lastEdgeSignature === ""
      const nodesChanged = nodeSignature !== lastNodeSignature
      lastNodeSignature = nodeSignature
      lastEdgeSignature = edgeSignature

      const elements = toElements(model)

      if (!nodesChanged && !isFirstModel) {
        // **The relationship-creation path.** Connecting two nodes already on
        // screen changes the edge set and nothing else, so only edges are
        // patched: no teardown, no layout, no camera move. The user watches the
        // new edge appear exactly where they drew it, which is the whole point
        // of not rebuilding.
        const wanted = new Set(model.edges.map((edge) => edge.id))
        cy.batch(() => {
          cy.edges()
            .filter((edge) => edge.id() !== PREVIEW_EDGE_ID && !wanted.has(edge.id()))
            .remove()
          const missing = elements.filter(
            (element) =>
              element.group === "edges" && cy.getElementById(String(element.data.id)).empty(),
          )
          if (missing.length > 0) cy.add(missing)
        })
        applyEditingVisual()
        return
      }

      // The node set changed, so positions must be recomputed. Camera state is
      // restored afterwards for anything but the first model — a refetch should
      // not throw away where the user was looking.
      const previous = currentViewport()
      cy.batch(() => {
        cy.elements().remove()
        cy.add(elements)
      })
      cy.layout(LAYOUT).run()

      if (isFirstModel) {
        cy.fit(undefined, FIT_PADDING)
      } else {
        cy.zoom(previous.zoom)
        cy.pan(previous.pan)
      }

      applyEditingVisual()
    },

    select(refs) {
      if (destroyed) return
      applyingSelection = true
      cy.$(":selected").unselect()
      resolve(refs).select()
      applyingSelection = false
      emit("selectionChange", readSelection())
    },

    setEditingVisual(visual) {
      if (destroyed) return
      editingVisual = visual
      applyEditingVisual()
    },

    zoomBy(factor) {
      if (destroyed) return
      const next = clamp(cy.zoom() * factor, ZOOM.min, ZOOM.max)
      // Zoom about the viewport centre rather than the origin, so the thing the
      // user is looking at stays where they are looking.
      cy.animate(
        { zoom: { level: next, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } } },
        { duration: CAMERA_ANIMATION_MS },
      )
    },

    fit() {
      if (destroyed || cy.elements().length === 0) return
      cy.animate(
        { fit: { eles: cy.elements(), padding: FIT_PADDING } },
        {
          duration: CAMERA_ANIMATION_MS,
        },
      )
    },

    fitTo(refs) {
      if (destroyed || cy.elements().length === 0) return
      const target = resolve(refs)
      // Framing "nothing" would zoom to the origin; framing everything is the
      // honest reading of an empty selection.
      const eles = target.nonempty() ? target : cy.elements()
      cy.animate({ fit: { eles, padding: FIT_PADDING } }, { duration: CAMERA_ANIMATION_MS })
    },

    centerOn(ref) {
      if (destroyed) return
      const element = cy.getElementById(ref.id)
      if (element.empty()) return
      cy.animate({ center: { eles: element } }, { duration: CAMERA_ANIMATION_MS })
    },

    resetViewport() {
      if (destroyed) return
      if (cy.elements().length === 0) {
        cy.zoom(ZOOM.default)
        cy.pan({ x: 0, y: 0 })
        return
      }
      cy.animate(
        { fit: { eles: cy.elements(), padding: FIT_PADDING } },
        {
          duration: CAMERA_ANIMATION_MS,
        },
      )
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
      if (selectionFrame !== null) cancelAnimationFrame(selectionFrame)
      for (const key of Object.keys(listeners) as GraphRendererEvent[]) listeners[key].clear()
      cy.destroy()
    },
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
