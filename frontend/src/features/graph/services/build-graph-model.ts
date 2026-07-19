/**
 * Backend response → `GraphModel`. Pure, synchronous, no React, no Cytoscape.
 *
 * ---------------------------------------------------------------------------
 * Two response shapes, one model
 * ---------------------------------------------------------------------------
 *
 * `GET /graph/characters/{id}/network?depth=N` now projects the **induced
 * subgraph**: the reachable nodes *and* every relationship whose endpoints both
 * appear, each with its direction, type, and sentiment. When that edge list is
 * present it is used verbatim — edges are facts at every depth, and
 * `edgesAreComplete` is true.
 *
 * The endpoint did not always do this. It previously returned reachable nodes
 * and nothing about the relationships between them, which forced an inference:
 *
 *  - At **depth 1** every returned neighbour is adjacent to the centre by
 *    definition, so a centre→neighbour edge is a fact and is drawn.
 *  - At **depth > 1** the response mixes one-, two-, and three-hop nodes
 *    indistinguishably. Drawing centre→neighbour edges there would assert
 *    relationships that were never reported — a graph that looks authoritative
 *    and is wrong — so the nodes are returned unlinked and flagged instead.
 *
 * That inference is kept as a fallback rather than deleted, because the schema
 * can tell the two responses apart (`relationships: null` versus `[]`) and a
 * client that silently claimed a complete edge set against an older backend
 * would be lying in exactly the way this module exists to prevent.
 *
 * `edgesAreComplete` travels on the model either way, so the renderer and the
 * UI notice cannot disagree about whether the absence of an edge means
 * "not connected" or "not reported".
 */

import type { CharacterNetwork } from "@/features/graph/model/graph.schema"
import type { GraphEdge, GraphModel, GraphNode } from "@/features/graph/model/graph.types"
import { toNodeKind } from "@/shared/domain/entity-kinds"

/**
 * Build the renderable model for a character's ego network.
 *
 * @param depth The depth the response was requested at — it is what determines
 *   whether adjacency can be inferred, and it is not echoed in the payload.
 */
export function buildEgoNetworkModel(network: CharacterNetwork, depth: number): GraphModel {
  // A projected edge list is authoritative at any depth. Only when the backend
  // reports none at all must adjacency be inferred, and then only at depth 1.
  const edgesAreProjected = network.relationships !== null
  const edgesAreComplete = edgesAreProjected || depth === 1

  const focus: GraphNode = {
    id: network.center.id,
    label: network.center.name,
    // The Cypher matched `(c:Character)`, so the centre's kind is known by
    // construction even though the projection omits `labels`.
    kind: "Character",
    isFocus: true,
  }

  const seen = new Set<string>([focus.id])
  const nodes: GraphNode[] = [focus]

  for (const neighbor of network.neighbors) {
    // A node can be reachable by several paths; the backend already applies
    // DISTINCT, but self-reference and duplicates are cheap to defend against
    // and a duplicate id would corrupt the renderer's element set.
    if (seen.has(neighbor.id)) continue
    seen.add(neighbor.id)

    nodes.push({
      id: neighbor.id,
      label: neighbor.name,
      kind: toNodeKind(neighbor.labels),
      isUnlinked: !edgesAreComplete,
    })
  }

  const edges = edgesAreProjected
    ? buildProjectedEdges(network.relationships ?? [], seen)
    : buildInferredEdges(focus.id, nodes, edgesAreComplete)

  return { nodes, edges, focusId: focus.id, edgesAreComplete }
}

/**
 * Edges the backend reported.
 *
 * Endpoints are checked against the node set even though the backend already
 * filters them: an edge pointing at a node the renderer was never given is not
 * a drawable edge, and Cytoscape throws rather than skipping it.
 */
function buildProjectedEdges(
  relationships: NonNullable<CharacterNetwork["relationships"]>,
  nodeIds: ReadonlySet<string>,
): GraphEdge[] {
  const edges: GraphEdge[] = []
  const seen = new Set<string>()

  for (const relationship of relationships) {
    if (!nodeIds.has(relationship.source) || !nodeIds.has(relationship.target)) continue

    const id = edgeId(relationship.source, relationship.target, relationship.relType)
    // Two nodes can be joined by several relationship *types*, so identity
    // includes the type — without it, MEMBER_OF would silently replace KNOWS.
    if (seen.has(id)) continue
    seen.add(id)

    edges.push({
      id,
      source: relationship.source,
      target: relationship.target,
      relType: relationship.relType,
      sentiment: relationship.sentiment,
    })
  }

  return edges
}

/**
 * The legacy inference: at depth 1, every neighbour is adjacent to the centre.
 *
 * Reached only against a backend that does not project relationships. It can
 * state *that* two nodes are connected but never how, so these edges carry no
 * type.
 */
function buildInferredEdges(
  focusId: string,
  nodes: readonly GraphNode[],
  adjacencyIsKnown: boolean,
): GraphEdge[] {
  if (!adjacencyIsKnown) return []

  return nodes
    .filter((node) => node.id !== focusId)
    .map((node) => ({
      id: edgeId(focusId, node.id),
      source: focusId,
      target: node.id,
    }))
}

/**
 * A stable, deterministic edge identity.
 *
 * Derived from its endpoints and type rather than generated, so re-fetching the
 * same network produces the same edge ids — which is what lets a future
 * incremental load merge results instead of duplicating them.
 */
export function edgeId(source: string, target: string, relType?: string): string {
  return relType ? `${source}-${relType}->${target}` : `${source}->${target}`
}
