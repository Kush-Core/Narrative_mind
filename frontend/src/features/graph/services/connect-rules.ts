/**
 * The rules of connecting, as pure functions.
 *
 * `useGraphEditing` holds *when* a connection is being made; this module answers
 * *what is allowed* and *what it should look like*. Splitting them follows the
 * pattern `build-graph-model.ts` already sets in this subsystem: the decisions
 * are pure and unit-testable, and the hook shrinks to state plus calls.
 *
 * None of the actual rules originate here either — legality is `canRelate` and
 * direction is `resolveRelationshipEndpoints`, both in
 * `shared/domain/relationships.ts`, so the graph and the entity screens are
 * governed by one statement of the backend's constraint rather than two.
 *
 * What this module adds is the graph's own concern: applying those rules across
 * a *set* of candidate nodes, and turning the answer into an appearance the
 * renderer can paint.
 */

import type { GraphEditingVisual, GraphModel, GraphNode } from "@/features/graph/model/graph.types"
import {
  canRelate,
  type RelationshipEndpoint,
  type RelationshipEndpoints,
  resolveRelationshipEndpoints,
} from "@/shared/domain/relationships"

/**
 * An entity endpoint for a node, or `null` when the node is not one.
 *
 * A node whose Neo4j label the client does not recognise renders as `Unknown`,
 * and there is no collection behind it — so it can be looked at but not
 * connected.
 */
export function endpointFromNode(node: GraphNode): RelationshipEndpoint | null {
  if (node.kind === "Unknown") return null
  return { id: node.id, name: node.label, kind: node.kind }
}

/**
 * Every node in the model that could legally receive a connection from `source`.
 *
 * Excludes the source itself (an entity cannot relate to itself) and anything
 * `canRelate` refuses — in practice, non-Character-to-non-Character, because the
 * write endpoint is a sub-resource of a character.
 */
export function validConnectionTargets(model: GraphModel, source: GraphNode): GraphNode[] {
  const sourceKind = source.kind
  // Bound to a const so the narrowing survives into the callback below, where
  // TypeScript would otherwise re-widen `source.kind` to include `Unknown`.
  if (sourceKind === "Unknown") return []

  return model.nodes.filter(
    (node) => node.id !== source.id && node.kind !== "Unknown" && canRelate(sourceKind, node.kind),
  )
}

/**
 * Turn an in-progress connection into an appearance instruction.
 *
 * A preview is only emitted for a node that is actually a legal destination:
 * drawing a proposed edge to a dimmed node would contradict the dimming.
 */
export function buildEditingVisual(
  source: GraphNode,
  validTargets: readonly GraphNode[],
  previewTargetId: string | null,
): GraphEditingVisual {
  const validTargetIds = validTargets.map((node) => node.id)
  const canPreview = previewTargetId !== null && validTargetIds.includes(previewTargetId)

  return {
    sourceId: source.id,
    validTargetIds,
    previewTargetId: canPreview ? previewTargetId : undefined,
  }
}

export type ConnectionOutcome =
  { ok: true; endpoints: Required<RelationshipEndpoints> } | { ok: false; reason: string }

/**
 * Decide the relationship implied by connecting two nodes.
 *
 * Returns the endpoints in the order the backend needs them — the Character
 * first — or the reason the pair cannot be connected. The caller shows the
 * reason rather than inventing one, so the message a user sees traces back to
 * the constraint that produced it.
 */
export function resolveConnection(source: GraphNode, target: GraphNode): ConnectionOutcome {
  if (source.id === target.id) {
    return { ok: false, reason: "An entity cannot be related to itself." }
  }

  const from = endpointFromNode(source)
  const to = endpointFromNode(target)

  if (!from || !to) {
    return { ok: false, reason: "This node's type is not recognised, so it cannot be connected." }
  }

  return resolveRelationshipEndpoints(from, to)
}
