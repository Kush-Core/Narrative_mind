import { useEffect, useRef, useState } from "react"

import { createGraphRenderer, type GraphRenderer } from "@/features/graph/engine"
import type { GraphModel } from "@/features/graph/model/graph.types"
import { cn } from "@/shared/lib/utils"

/**
 * The bridge between React's declarative lifecycle and the renderer's imperative
 * one.
 *
 * This component's entire job is: own a DOM node, create exactly one renderer
 * into it, push model changes down, keep it sized, and destroy it on unmount. It
 * renders no graph itself and knows no drawing library.
 *
 * Two things it deliberately does **not** do:
 *
 *  - **Re-create the renderer when data changes.** The renderer is created once
 *    per mount and fed via `setModel`; tying its lifetime to the data would
 *    discard layout and camera state on every refetch.
 *  - **Mirror graph state into React.** Nodes and edges live in the renderer.
 *    Duplicating them into component state is the classic path to a graph view
 *    that re-renders thousands of nodes through the VDOM — the architectural
 *    dead end that makes large graphs impossible later.
 */

interface GraphCanvasProps {
  model: GraphModel
  /** Handed back once the renderer exists, so the workspace can command it. */
  onRendererReady: (renderer: GraphRenderer | null) => void
  className?: string
  /** Accessible description of what the canvas is showing. */
  label: string
}

export function GraphCanvas({ model, onRendererReady, className, label }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderer, setRenderer] = useState<GraphRenderer | null>(null)

  // Held in a ref so the mount effect never re-runs because the parent passed a
  // new function identity — that would destroy and rebuild the whole graph.
  // Synced in an effect rather than during render: a ref write during render is
  // not safe under concurrent rendering, where a render may be discarded.
  const notifyReady = useRef(onRendererReady)
  useEffect(() => {
    notifyReady.current = onRendererReady
  }, [onRendererReady])

  /* Create once per mount, destroy on unmount. */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const instance = createGraphRenderer({ container })
    setRenderer(instance)
    notifyReady.current(instance)

    return () => {
      notifyReady.current(null)
      setRenderer(null)
      instance.destroy()
    }
  }, [])

  /* Push data down. Cheap when the topology is unchanged. */
  useEffect(() => {
    renderer?.setModel(model)
  }, [renderer, model])

  /**
   * Keep the canvas sized to its container.
   *
   * A `ResizeObserver` rather than a window listener: the workspace sits inside
   * resizable shell panels, so the canvas changes size without the window ever
   * doing so.
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container || !renderer) return

    const observer = new ResizeObserver(() => renderer.resize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [renderer])

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full", className)}
      // The graph is an image of data, not a document: exposing it as one
      // labelled region is more useful to a screen reader than a canvas full of
      // unreachable shapes. The inspector panel carries the readable detail.
      role="img"
      aria-label={label}
    />
  )
}
