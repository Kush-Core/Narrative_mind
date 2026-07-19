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

import type { GraphElementRef, GraphModel, GraphViewport } from "@/features/graph/model/graph.types"

/**
 * Events a renderer emits.
 *
 * `elementActivate` is separate from selection because activation is a
 * *navigation* intent (open this entity) while selection is an *inspection* one.
 * Conflating them would make a single click navigate away from the graph.
 */
export interface GraphRendererEventMap {
  /** Selection changed, including to nothing (background click, Escape). */
  selectionChange: GraphElementRef | null
  /** Camera moved — fired at interaction frequency, so handlers must be cheap. */
  viewportChange: GraphViewport
  /** The user asked to open an element (double-click). */
  elementActivate: GraphElementRef
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

  /** Programmatic selection; `null` clears it. Must emit `selectionChange`. */
  select(ref: GraphElementRef | null): void

  /* -------------------------------------------------------------- viewport */

  /** Multiply zoom about the viewport centre (>1 in, <1 out). */
  zoomBy(factor: number): void
  /** Frame the whole graph. */
  fit(): void
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
