/**
 * The Graph resource layer.
 *
 * Plain functions over the shared `httpClient` — deliberately **not**
 * `createEntityResource`. That factory encodes the CRUD triad (list with
 * pagination, get, create, update, delete); the graph endpoints are two reads
 * with their own shapes and share none of it. Bending them through the factory
 * would mean inventing pagination for a thing that has none, which is exactly
 * the "don't force the graph into CRUD abstractions" line.
 *
 * What *is* reused is everything genuinely application-level: the single network
 * choke point, its error normalization, cancellation, and schema validation
 * (docs/frontend/API_INTEGRATION_PLAN.md §1 — "non-CRUD endpoints remain plain
 * hand-written resource functions").
 */

import { type CharacterNetwork, CharacterNetworkSchema } from "@/features/graph/model/graph.schema"
import { endpoints } from "@/shared/api/endpoints"
import { httpClient } from "@/shared/api/http-client"

export interface GraphCallOptions {
  signal?: AbortSignal
}

/**
 * The ego network around one character.
 *
 * `depth` is bounded 1–3 by the backend (`Query(ge=1, le=3)`); callers pass a
 * value already validated by `NetworkDepthSchema`, so an out-of-range depth
 * cannot reach the wire.
 */
export function fetchCharacterNetwork(
  characterId: string,
  depth: number,
  options: GraphCallOptions = {},
): Promise<CharacterNetwork> {
  return httpClient.get<CharacterNetwork>(endpoints.graph.network(characterId), {
    query: { depth },
    schema: CharacterNetworkSchema,
    signal: options.signal,
  })
}
