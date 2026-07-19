/**
 * Graph server-state hooks.
 *
 * Reuses the app's single query cache and its pre-reserved key namespace
 * (`queryKeys.graph.*`, registered in M2 before this feature existed). Graph
 * reads are ordinary server state — cached, cancellable, invalidated by
 * `invalidateGraph` when a relationship write lands — so they belong in the same
 * cache as everything else. Only *rendering* is special about this subsystem.
 *
 * The model is built inside `select` rather than in the component: it is a pure
 * function of the response, so TanStack Query memoizes it per cache entry and
 * the canvas is not handed a freshly-allocated model on every render — which
 * would otherwise re-seed the renderer on unrelated state changes.
 */

import { useQuery } from "@tanstack/react-query"

import { fetchCharacterNetwork } from "@/features/graph/api/graph.api"
import type { GraphModel } from "@/features/graph/model/graph.types"
import { buildEgoNetworkModel } from "@/features/graph/services/build-graph-model"
import { queryKeys } from "@/shared/api/query-keys"

/**
 * The ego network around a character, as a ready-to-render `GraphModel`.
 *
 * Disabled until a character is chosen, so the workspace's empty state is a
 * genuine "nothing selected" rather than a failed request.
 */
export function useCharacterNetworkQuery(characterId: string | undefined, depth: number) {
  return useQuery({
    queryKey: queryKeys.graph.network(characterId ?? "", depth),
    queryFn: ({ signal }) => fetchCharacterNetwork(characterId ?? "", depth, { signal }),
    enabled: Boolean(characterId),
    select: (network): GraphModel => buildEgoNetworkModel(network, depth),
  })
}
