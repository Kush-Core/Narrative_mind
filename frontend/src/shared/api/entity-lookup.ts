/**
 * Searching *any* entity collection for something to point at.
 *
 * The narrowest possible read: given a collection and a search term, return
 * `{ id, name }` pairs. Nothing else — no descriptor, no form fields, no
 * columns, no per-entity schema.
 *
 * ---------------------------------------------------------------------------
 * Why this exists rather than reusing the entity descriptors
 * ---------------------------------------------------------------------------
 *
 * A picker that imported the four descriptors to reach their `resource` would
 * make every consumer of the picker depend on all four feature slices. The
 * relationship dialog is consumed *by* those slices (each detail screen opens
 * it), so that dependency would close a cycle:
 *
 *     characters → relationship dialog → picker → characters
 *
 * Breaking it by importing lazily, or by threading descriptors down as props
 * from every call site, would both be working around a boundary rather than
 * respecting one. The real observation is that a picker needs far less than a
 * descriptor carries: an id, a name, and a search. That much is identical across
 * all four collections — the list endpoints are byte-for-byte parallel
 * (backend/src/narrative_mind/api/routers/) — so it is expressible in `shared/`
 * with no feature import at all, and the cycle never forms.
 *
 * The cost is a second, smaller schema for data the entity schemas already
 * validate. That is the intended trade: a few lines of Zod against a structural
 * dependency cycle.
 */

import { z } from "zod"

import { endpoints, type EntityCollection } from "@/shared/api/endpoints"
import { httpClient } from "@/shared/api/http-client"
import { pageSchema } from "@/shared/schemas/page.schema"
import { IdSchema } from "@/shared/schemas/primitives"

/** The minimum needed to display a choice and submit it. */
export const EntityOptionSchema = z.object({
  id: IdSchema,
  name: z.string(),
})

export type EntityOption = z.infer<typeof EntityOptionSchema>

const EntityOptionPageSchema = pageSchema(EntityOptionSchema)

export interface EntityLookupInput {
  /** Substring match on name — the backend's `name_contains`. */
  search?: string
  limit?: number
  signal?: AbortSignal
}

/**
 * Enough to browse without paging; the search narrows anything larger. Kept
 * modest because a picker is a transient surface, not a list screen.
 */
export const ENTITY_LOOKUP_LIMIT = 50

/**
 * List one collection's entities as pickable options.
 *
 * Always sorted by name ascending: every collection honours `name` as a sort
 * field, and alphabetical is the only ordering that helps someone scanning for
 * a name they already have in mind.
 */
export async function lookupEntities(
  collection: EntityCollection,
  { search, limit = ENTITY_LOOKUP_LIMIT, signal }: EntityLookupInput = {},
): Promise<EntityOption[]> {
  const trimmed = search?.trim()

  const page = await httpClient.get(endpoints.entity(collection).list(), {
    query: {
      limit,
      offset: 0,
      sort_by: "name",
      order: "asc",
      name_contains: trimmed === "" ? undefined : trimmed,
    },
    schema: EntityOptionPageSchema,
    signal,
  })

  return page.items
}

/**
 * Fetch one entity as an option, for resolving a preselected id to a name.
 *
 * Returns `null` on a 404 rather than throwing: a picker holding a stale id
 * should show an unresolved value, not break the screen it sits on.
 */
export async function lookupEntity(
  collection: EntityCollection,
  id: string,
  signal?: AbortSignal,
): Promise<EntityOption | null> {
  try {
    return await httpClient.get(endpoints.entity(collection).detail(id), {
      schema: EntityOptionSchema,
      signal,
    })
  } catch {
    return null
  }
}
