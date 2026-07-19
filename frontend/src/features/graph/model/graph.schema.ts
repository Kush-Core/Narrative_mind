/**
 * The graph wire contract — Zod schemas for the two `/graph` reads.
 *
 * These endpoints are the app's only **untyped** backend surface: both handlers
 * are declared `-> dict` in `api/routers/graph.py`, so FastAPI generates no
 * response model and there is no OpenAPI shape to lean on. Validating here is
 * therefore doing more work than it does for the entities — it is the only thing
 * standing between a Cypher projection change and a runtime crash inside the
 * renderer.
 *
 * Verified against `repositories/graph_repo.py`:
 *
 *   ego_network → { center:        { id, name },
 *                   neighbors:     [{ id, name, labels: string[] }],
 *                   relationships: [{ source, target, rel_type, sentiment }] }
 *
 * `relationships` is the **induced subgraph** over the reported nodes — every
 * edge whose endpoints both appear, not merely those on a path outward from the
 * centre. That is what lets the client draw the graph instead of inferring it.
 */

import { z } from "zod"

import { IdSchema } from "@/shared/schemas/primitives"

/**
 * The centre node.
 *
 * The Cypher projects `c {.id, .name}` only — no `labels` — because the pattern
 * already matched `(c:Character)`. So the kind is known by construction rather
 * than reported, and the mapper supplies it.
 */
const NetworkCenterSchema = z.object({
  id: IdSchema,
  name: z.string(),
})

/**
 * A reachable node.
 *
 * `labels` is defaulted rather than required: an unlabelled node should render
 * as `Unknown`, not fail the whole response.
 */
const NetworkNeighborSchema = z.object({
  id: IdSchema,
  name: z.string().nullish(),
  labels: z.array(z.string()).nullish(),
})

/**
 * One projected relationship.
 *
 * `sentiment` is only meaningful on `KNOWS` edges (the backend sets it on any
 * edge it is given, but no other type has a use for it), so it is optional
 * rather than part of the edge's identity.
 */
const NetworkRelationshipSchema = z.object({
  source: IdSchema,
  target: IdSchema,
  rel_type: z.string(),
  sentiment: z.string().nullish(),
})

export const CharacterNetworkSchema = z
  .object({
    center: NetworkCenterSchema,
    neighbors: z.array(NetworkNeighborSchema).nullish(),
    /**
     * Absent — not merely empty — against a backend that predates edge
     * projection. The distinction is load-bearing and is preserved below.
     */
    relationships: z.array(NetworkRelationshipSchema).nullish(),
  })
  .transform((wire) => ({
    center: { id: wire.center.id, name: wire.center.name },
    neighbors: (wire.neighbors ?? []).map((neighbor) => ({
      id: neighbor.id,
      name: neighbor.name ?? "Untitled",
      labels: neighbor.labels ?? [],
    })),
    /**
     * `null` means the backend did not project relationships at all; `[]` means
     * it did and there are none. Collapsing the two would make an unconnected
     * character indistinguishable from an endpoint that cannot report edges,
     * and the model would claim a complete edge set it does not have.
     */
    relationships:
      wire.relationships == null
        ? null
        : wire.relationships.map((relationship) => ({
            source: relationship.source,
            target: relationship.target,
            relType: relationship.rel_type,
            sentiment: relationship.sentiment ?? undefined,
          })),
  }))

export type CharacterNetwork = z.infer<typeof CharacterNetworkSchema>

/**
 * Depth bounds, mirroring the router's `Query(ge=1, le=3)` and the repository's
 * own clamp. Enforced client-side so a hand-edited URL cannot produce a 422.
 */
export const NETWORK_DEPTH = { min: 1, max: 3, default: 1 } as const

export const NetworkDepthSchema = z.coerce
  .number()
  .int()
  .min(NETWORK_DEPTH.min)
  .max(NETWORK_DEPTH.max)
  .catch(NETWORK_DEPTH.default)
  .default(NETWORK_DEPTH.default)
