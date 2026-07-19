/**
 * Editing state — the connect workflow, kept apart from everything else.
 *
 * This is the fourth state owner in the workspace (STATE_MANAGEMENT.md), and the
 * one that has to stay furthest from the renderer:
 *
 *   | State              | Owner                  |
 *   |--------------------|------------------------|
 *   | Backend graph data | TanStack Query         |
 *   | Which graph to show| URL search params      |
 *   | Selection          | `useGraphInteraction`  |
 *   | **Editing**        | **here**               |
 *   | Viewport           | the renderer           |
 *
 * ---------------------------------------------------------------------------
 * What lives here, and what deliberately does not
 * ---------------------------------------------------------------------------
 *
 * Here: which node a connection started from, which nodes may receive it, which
 * one is being previewed, and when the pair is complete.
 *
 * **Not** here: what a relationship is, which pairings are legal, or how one is
 * written. Legality comes from `canRelate` and direction from
 * `resolveRelationshipEndpoints` — both in `shared/domain/relationships.ts`, so
 * the graph and the entity screens are governed by one rule rather than two that
 * might drift. Writing is `useCreateRelationship`, unchanged and shared.
 *
 * The renderer learns about all this through exactly one command,
 * `setEditingVisual`, which describes appearance and nothing else. Nothing in
 * this file imports the engine.
 */

import { useCallback, useMemo, useState } from "react"

import type { GraphEditingVisual, GraphModel, GraphNode } from "@/features/graph/model/graph.types"
import {
  buildEditingVisual,
  resolveConnection,
  validConnectionTargets,
} from "@/features/graph/services/connect-rules"
import type { RelationshipEndpoints } from "@/shared/domain/relationships"

/**
 * The workflow, as a state machine.
 *
 * `idle` and `connecting` are the only two: once both ends are chosen the
 * endpoints are handed to the shared dialog, which owns type selection and
 * confirmation. Modelling "choosing a type" as a third graph state would be
 * re-implementing the dialog's job in the graph.
 */
export type GraphEditingMode = "idle" | "connecting"

export interface GraphEditing {
  mode: GraphEditingMode
  /** The node a connection is being drawn from, when connecting. */
  sourceNode: GraphNode | null
  /** Appearance instruction for the renderer, or `null` when idle. */
  visual: GraphEditingVisual | null
  /** Set once both ends are chosen; drives the shared relationship dialog. */
  pendingEndpoints: RelationshipEndpoints | null
  /** Why the last attempted destination was rejected, if it was. */
  rejection: string | null

  beginConnect: (nodeId: string) => void
  /** Offer a node as the destination. Ignored when idle or illegal. */
  chooseTarget: (nodeId: string) => void
  /** Report what the pointer is over, so a legal destination can be previewed. */
  previewTarget: (nodeId: string | null) => void
  cancel: () => void
  /** Clear the pending pair — the dialog closed, whether or not it wrote. */
  resolvePending: () => void
}

export function useGraphEditing(model: GraphModel): GraphEditing {
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [pendingEndpoints, setPendingEndpoints] = useState<RelationshipEndpoints | null>(null)
  const [rejection, setRejection] = useState<string | null>(null)

  const nodesById = useMemo(() => {
    const index = new Map<string, GraphNode>()
    for (const node of model.nodes) index.set(node.id, node)
    return index
  }, [model])

  const sourceNode = sourceId ? (nodesById.get(sourceId) ?? null) : null

  /**
   * Which nodes may legally receive the connection.
   *
   * Derived rather than stored: it is a pure function of the source and the
   * model, so storing it would create a second thing to keep in sync with a
   * refetch.
   */
  const validTargets = useMemo(
    () => (sourceNode ? validConnectionTargets(model, sourceNode) : []),
    [sourceNode, model],
  )

  const visual = useMemo<GraphEditingVisual | null>(
    () => (sourceNode ? buildEditingVisual(sourceNode, validTargets, previewId) : null),
    [sourceNode, validTargets, previewId],
  )

  const reset = useCallback(() => {
    setSourceId(null)
    setPreviewId(null)
    setRejection(null)
  }, [])

  const beginConnect = useCallback((nodeId: string) => {
    setSourceId(nodeId)
    setPreviewId(null)
    setRejection(null)
  }, [])

  const chooseTarget = useCallback(
    (nodeId: string) => {
      if (!sourceNode || nodeId === sourceNode.id) return

      const target = nodesById.get(nodeId)
      if (!target) return

      const outcome = resolveConnection(sourceNode, target)
      if (!outcome.ok) {
        // Reachable only if a click lands on a node the visual marked invalid;
        // the message is the rule's, not one invented here.
        setRejection(outcome.reason)
        return
      }

      setPendingEndpoints(outcome.endpoints)
      setSourceId(null)
      setPreviewId(null)
      setRejection(null)
    },
    [sourceNode, nodesById],
  )

  const previewTarget = useCallback(
    (nodeId: string | null) => {
      if (!sourceId) return
      setPreviewId(nodeId)
    },
    [sourceId],
  )

  const resolvePending = useCallback(() => setPendingEndpoints(null), [])

  return {
    mode: sourceId ? "connecting" : "idle",
    sourceNode,
    visual,
    pendingEndpoints,
    rejection,
    beginConnect,
    chooseTarget,
    previewTarget,
    cancel: reset,
    resolvePending,
  }
}
