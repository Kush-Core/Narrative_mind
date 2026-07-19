/**
 * Backend response → `GraphModel`. Pure, synchronous, no React, no Cytoscape.
 *
 * ---------------------------------------------------------------------------
 * The constraint this module exists to handle honestly
 * ---------------------------------------------------------------------------
 *
 * `GET /graph/characters/{id}/network?depth=N` runs:
 *
 *     OPTIONAL MATCH (c)-[*1..N]-(n)
 *     RETURN c {.id,.name} AS center,
 *            collect(DISTINCT n {.id,.name,labels:labels(n)}) AS neighbors
 *
 * It returns the **set of reachable nodes and nothing about the relationships
 * between them** — no edge list, no relationship types, not even which neighbour
 * is adjacent to which.
 *
 * That has a sharp consequence:
 *
 *  - At **depth 1**, every returned neighbour is by definition directly adjacent
 *    to the centre. A centre→neighbour edge is a fact, and we draw it.
 *  - At **depth > 1**, the response mixes nodes one, two, and three hops out with
 *    no way to tell them apart. Drawing centre→neighbour edges would assert
 *    direct relationships that were never reported and may not exist — the graph
 *    would look authoritative and be wrong.
 *
 * A graph view that invents edges is worse than one that admits it cannot see
 * them, so beyond depth 1 the nodes are returned unlinked and flagged. The
 * `edgesAreComplete` bit travels with the model so the renderer and the UI notice
 * stay in agreement rather than each deciding for themselves.
 *
 * **This is a backend gap, not a frontend design choice.** The fix is for the
 * ego-network endpoint to project relationships as well as nodes; when it does,
 * only this file changes — the model, renderer, and components are already
 * shaped for a real edge list.
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
  // Only a depth-1 response carries enough information to state adjacency.
  const adjacencyIsKnown = depth === 1

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
  const edges: GraphEdge[] = []

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
      isUnlinked: !adjacencyIsKnown,
    })

    if (adjacencyIsKnown) {
      edges.push({
        id: edgeId(focus.id, neighbor.id),
        source: focus.id,
        target: neighbor.id,
        // Relationship types are not projected by the graph reads, so an edge
        // carries none. The field exists for when they are.
      })
    }
  }

  return { nodes, edges, focusId: focus.id, edgesAreComplete: adjacencyIsKnown }
}

/**
 * A stable, deterministic edge identity.
 *
 * Derived from its endpoints rather than generated, so re-fetching the same
 * network produces the same edge ids — which is what will let a future
 * incremental load merge results instead of duplicating them.
 */
export function edgeId(source: string, target: string): string {
  return `${source}->${target}`
}
