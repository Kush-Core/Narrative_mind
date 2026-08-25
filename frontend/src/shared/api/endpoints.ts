/**
 * Every backend path the app knows about, in one place.
 *
 * No endpoint string is written anywhere else. Resource modules compose these
 * builders, so the backend's URL surface is greppable in a single file and a
 * future change (an `/api/v1` prefix, a `worldId` segment — architecture §7.4)
 * is one edit rather than a hunt.
 *
 * Paths only: *where* the backend lives is `appConfig.apiBaseUrl`, and the two
 * are joined by the HTTP client.
 *
 * Mirrors the verified surface in docs/REPOSITORY_ANALYSIS.md §API Surface.
 */

import { encodePathSegment } from "@/shared/lib/url"

/**
 * Collection paths for the four entity resources. Kept as a named map so a
 * resource module is configured with a key rather than a raw string.
 */
export const ENTITY_COLLECTIONS = {
  characters: "/characters",
  locations: "/locations",
  factions: "/factions",
  events: "/events",
} as const

export type EntityCollection = keyof typeof ENTITY_COLLECTIONS

export const endpoints = {
  system: {
    health: () => "/health",
  },

  auth: {
    register: () => "/auth/register",
    login: () => "/auth/login",
  },

  /**
   * Generic CRUD paths for any entity collection. The four entity routers are
   * byte-for-byte parallel (analysis §API Surface), so one builder serves all
   * of them rather than four identical copies.
   */
  entity: (collection: EntityCollection) => ({
    list: () => ENTITY_COLLECTIONS[collection],
    create: () => ENTITY_COLLECTIONS[collection],
    detail: (id: string) => `${ENTITY_COLLECTIONS[collection]}/${encodePathSegment(id)}`,
  }),

  /**
   * Relationships are Character-rooted only — there is no generic
   * `/{collection}/{id}/relationships` (analysis §API Surface), so this is
   * deliberately not part of the generic entity builder above.
   */
  characters: {
    relationships: (characterId: string) =>
      `/characters/${encodePathSegment(characterId)}/relationships`,
  },

  graph: {
    network: (characterId: string) => `/graph/characters/${encodePathSegment(characterId)}/network`,
    shortestPath: () => "/graph/shortest-path",
  },

  /**
   * The AI surface. Two backend routers share the `/ai` prefix — `routers/ai.py`
   * (describe, extract: model calls over the request body alone) and
   * `routers/rag.py` (retrieve, ask: Graph RAG over the caller's own world) —
   * but they are one path namespace to the client, so they are one entry here.
   */
  ai: {
    describe: () => "/ai/describe",
    extract: () => "/ai/extract",
    retrieve: () => "/ai/retrieve",
    ask: () => "/ai/ask",
  },
} as const
