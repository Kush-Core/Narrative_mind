/**
 * The invalidation strategy, in one place.
 *
 * After a write, the cache must be brought back in line with the server. The
 * policy (docs/frontend/API_INTEGRATION_PLAN.md §6, STATE_MANAGEMENT.md §2) is
 * deliberately asymmetric:
 *
 *  - **Create / delete → invalidate every list of that entity.** Both change
 *    `total` and shift page membership, so surgically patching one cached page
 *    would leave the others quietly wrong. Lists are cheap to refetch; being
 *    subtly wrong is not.
 *  - **Update → patch the detail key, then invalidate the entity root.** The
 *    updated entity is already in hand, so the detail view can settle instantly
 *    while lists reconcile in the background.
 *
 * Invalidation happens at the *coarsest safe level*. Being slightly too broad
 * costs a refetch; being too narrow costs correctness.
 *
 * A relationship write is a graph write: it does not change any entity's own
 * fields, but it does change every network and path derived from it.
 */

import type { QueryClient } from "@tanstack/react-query"

import type { EntityCollection } from "@/shared/api/endpoints"
import { entityKeys, queryKeys } from "@/shared/api/query-keys"

/** After creating an entity: every list of that entity is now stale. */
export function invalidateAfterCreate(
  queryClient: QueryClient,
  collection: EntityCollection,
): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: entityKeys(collection).lists() })
}

/**
 * After updating an entity: seed the detail cache with the server's response so
 * the detail view settles without a round trip, then let lists refetch.
 */
export async function invalidateAfterUpdate<TEntity>(
  queryClient: QueryClient,
  collection: EntityCollection,
  id: string,
  updated?: TEntity,
): Promise<void> {
  const keys = entityKeys(collection)
  if (updated !== undefined) {
    queryClient.setQueryData(keys.detail(id), updated)
  }
  await queryClient.invalidateQueries({ queryKey: keys.root() })
}

/**
 * After deleting an entity: drop its detail entry outright — refetching a
 * deleted id would only produce a 404 — and refresh the lists.
 */
export async function invalidateAfterDelete(
  queryClient: QueryClient,
  collection: EntityCollection,
  id: string,
): Promise<void> {
  const keys = entityKeys(collection)
  queryClient.removeQueries({ queryKey: keys.detail(id) })
  await queryClient.invalidateQueries({ queryKey: keys.lists() })
}

/**
 * After writing a relationship: entity fields are untouched, but every derived
 * graph read is stale.
 */
export function invalidateGraph(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: queryKeys.graph.root() })
}

/**
 * After creating a relationship.
 *
 * Two things go stale, and they are stale for different reasons:
 *
 *  - **Every graph read.** A new edge changes ego networks and shortest paths
 *    the client has no way to recompute, and the graph is where the write
 *    becomes visible. This is the one that matters.
 *  - **The two endpoints' detail entries.** Neither entity's own *fields*
 *    changed, so this buys nothing today. It is included because the alternative
 *    — remembering to add it when detail screens start reading relationships —
 *    is exactly the kind of coupling that gets forgotten, and a refetch of two
 *    cached records is not a cost worth optimising against that risk.
 *
 * Lists are deliberately **not** invalidated: no list column derives from
 * relationships, so refetching every page of both collections would be pure
 * waste.
 */
export async function invalidateAfterRelationship(
  queryClient: QueryClient,
  endpoints: readonly { collection: EntityCollection; id: string }[],
): Promise<void> {
  await Promise.all([
    invalidateGraph(queryClient),
    ...endpoints.map((endpoint) =>
      queryClient.invalidateQueries({
        queryKey: entityKeys(endpoint.collection).detail(endpoint.id),
      }),
    ),
  ])
}

/**
 * Drop everything. Reserved for an identity change, so no cached data leaks
 * across users when authentication arrives (architecture §7.1).
 */
export function resetCache(queryClient: QueryClient): void {
  queryClient.clear()
}
