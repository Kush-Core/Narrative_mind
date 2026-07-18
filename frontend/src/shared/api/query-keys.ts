/**
 * The central query-key registry (docs/frontend/STATE_MANAGEMENT.md §2).
 *
 * Every key in the app is produced here. Keys are never written ad hoc at call
 * sites, because invalidation correctness depends entirely on keys being
 * *structurally predictable*: `['characters']` must be a prefix of
 * `['characters','list',…]` for a coarse invalidation to reach it.
 *
 * Keeping them in one file also makes the future per-identity or per-world
 * prefix (architecture §7.1, §7.4) a single edit.
 *
 * Key shapes:
 *   ['system','health']
 *   ['characters']                          → everything about characters
 *   ['characters','list']                   → every list, any params
 *   ['characters','list', normalizedParams] → one specific list
 *   ['characters','detail', id]             → one entity
 *   ['graph','network', characterId, depth]
 *   ['graph','shortest-path', source, target]
 */

import type { EntityCollection } from "@/shared/api/endpoints"
import type { UnknownRecord } from "@/shared/types/utility"

/**
 * Normalize query params into a stable key fragment.
 *
 * Two logically identical queries must produce the same key or they will occupy
 * separate cache entries and refetch needlessly. Sorting the keys and dropping
 * `undefined` makes `{limit:20, offset:0}` and `{offset:0, limit:20, status:undefined}`
 * the same cache entry.
 */
export function normalizeQueryParams(params: UnknownRecord): UnknownRecord {
  const normalized: UnknownRecord = {}
  for (const key of Object.keys(params).sort()) {
    const value = params[key]
    if (value === undefined || value === null || value === "") continue
    normalized[key] = value
  }
  return normalized
}

/**
 * The key factory for one entity collection. Each entity slice re-exports the
 * factory for its own collection rather than defining new key shapes.
 */
export function entityKeys(collection: EntityCollection) {
  const root = [collection] as const

  return {
    root: () => root,
    /** Prefix matching every list of this entity — the create/delete invalidation target. */
    lists: () => [...root, "list"] as const,
    list: (params: UnknownRecord) => [...root, "list", normalizeQueryParams(params)] as const,
    /** Prefix matching every detail of this entity. */
    details: () => [...root, "detail"] as const,
    detail: (id: string) => [...root, "detail", id] as const,
  }
}

export const queryKeys = {
  system: {
    root: () => ["system"] as const,
    health: () => ["system", "health"] as const,
  },

  characters: entityKeys("characters"),
  locations: entityKeys("locations"),
  factions: entityKeys("factions"),
  events: entityKeys("events"),

  graph: {
    root: () => ["graph"] as const,
    network: (characterId: string, depth: number) =>
      ["graph", "network", characterId, depth] as const,
    shortestPath: (source: string, target: string) =>
      ["graph", "shortest-path", source, target] as const,
  },
} as const

/** Every entity collection that has a key factory — used by invalidation helpers. */
export const ENTITY_QUERY_COLLECTIONS = [
  "characters",
  "locations",
  "factions",
  "events",
] as const satisfies readonly EntityCollection[]
