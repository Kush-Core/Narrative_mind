/**
 * The rendering contract (docs/frontend/FRONTEND_ARCHITECTURE.md §7.3, D11).
 *
 * This interface is the entire public surface of the drawing engine. Components,
 * hooks, and services depend on *this*; exactly one directory
 * (`engine/cytoscape/`) depends on Cytoscape. Replacing the library means
 * writing one new implementation of this file's interface and changing the
 * factory — nothing above the engine moves.
 *
 * Three deliberate properties:
 *
 *  - **Imperative, not declarative.** Graph rendering is a stateful, animated,
 *    canvas-bound concern; pretending otherwise (re-rendering a graph as a
 *    function of props) fights the library and discards its layout and camera
 *    state on every parent render. React owns *when* to call these methods, not
 *    what they do.
 *  - **Events out, commands in.** The renderer reports what the user did; it
 *    never reaches into application state. That is what keeps interaction state
 *    independent of the rendering implementation.
 *  - **No Cytoscape types leak.** Every signature here is expressed in the
 *    subsystem's own vocabulary from `model/graph.types.ts`.
 */

import type {
  GraphEditingVisual,
  GraphElementRef,
  GraphModel,
  GraphPoint,
  GraphViewport,
} from "@/features/graph/model/graph.types"

/** An element and where on screen the pointer was when it was invoked. */
export interface GraphPointerTarget {
  ref: GraphElementRef
  /** Viewport coordinates, for anchoring a menu. */
  position: GraphPoint
}

/**
 * Events a renderer emits.
 *
 * `elementActivate` is separate from selection because activation is a
 * *navigation* intent (open this entity) while selection is an *inspection* one.
 * Conflating them would make a single click navigate away from the graph.
 */
export interface GraphRendererEventMap {
  /**
   * Selection changed, including to nothing (background click, Escape).
   *
   * An array rather than a nullable single ref: the view supports selecting
   * several elements to frame them together, and the **last entry is the
   * primary** one — what the inspector describes. Empty means nothing selected.
   * Modelling it as a list rather than "one plus some others" keeps the renderer
   * from having to know which one the application considers interesting.
   */
  selectionChange: GraphElementRef[]
  /** Camera moved — fired at interaction frequency, so handlers must be cheap. */
  viewportChange: GraphViewport
  /** The user asked to open an element (double-click). */
  elementActivate: GraphElementRef
  /** The pointer entered or left an element. `null` on leave. */
  hoverChange: GraphElementRef | null
  /** The user asked for an element's contextual actions (right-click). */
  elementContextMenu: GraphPointerTarget
  /**
   * The user clicked empty canvas.
   *
   * Distinct from a selection change to nothing: a mode that is *waiting* for a
   * click (connect mode) needs to know the click happened, and inferring it from
   * an empty selection would also fire when Escape clears the selection.
   */
  backgroundTap: GraphPoint
}

export type GraphRendererEvent = keyof GraphRendererEventMap

/** Unsubscribe handle, so callers never need to retain the handler identity. */
export type Unsubscribe = () => void

export interface GraphRenderer {
  /**
   * Replace the rendered graph.
   *
   * Implementations should preserve camera state across calls where the graph is
   * recognisably the same, so a refetch does not throw away the user's position.
   */
  setModel(model: GraphModel): void

  /**
   * Programmatic selection; an empty array clears it. Must emit
   * `selectionChange`.
   */
  select(refs: readonly GraphElementRef[]): void

  /* --------------------------------------------------------------- editing */

  /**
   * Decorate the graph for an in-progress edit, or clear it with `null`.
   *
   * Purely presentational. The renderer paints an origin, a set of legal
   * destinations, and an optional preview connection; it decides nothing about
   * whether an edit is valid — it is told.
   */
  setEditingVisual(visual: GraphEditingVisual | null): void

  /* -------------------------------------------------------------- viewport */

  /** Multiply zoom about the viewport centre (>1 in, <1 out). Animated. */
  zoomBy(factor: number): void
  /** Frame the whole graph. Animated. */
  fit(): void
  /** Frame just these elements. Falls back to the whole graph if none resolve. */
  fitTo(refs: readonly GraphElementRef[]): void
  /** Bring one element to the viewport centre without changing zoom. */
  centerOn(ref: GraphElementRef): void
  /** Return to the default camera — fit at the default zoom. */
  resetViewport(): void
  /** Re-read the container's size. Call after a layout change. */
  resize(): void
  getViewport(): GraphViewport

  /* ---------------------------------------------------------------- events */

  on<K extends GraphRendererEvent>(
    event: K,
    handler: (payload: GraphRendererEventMap[K]) => void,
  ): Unsubscribe

  /** Tear down listeners and release the canvas. Must be idempotent. */
  destroy(): void
}

export interface GraphRendererOptions {
  container: HTMLElement
}

/**
 * How a renderer is obtained.
 *
 * A factory rather than a constructor so the concrete implementation — and the
 * ~400 kB library behind it — can be selected, and dynamically imported, without
 * any caller naming it.
 */
export type GraphRendererFactory = (options: GraphRendererOptions) => GraphRenderer
