/**
 * The shared abstraction every entity API module is built from.
 *
 * **Why this is infrastructure and not premature abstraction.** The backend's
 * four entity routers, services, and repositories are byte-for-byte parallel —
 * same verbs, same pagination contract, same PATCH semantics, same error shapes
 * (backend/src/narrative_mind/{api/routers,services,repositories}/). That
 * symmetry is a *verified fact
 * about the backend*, not a guess about the future, so encoding it once is
 * warranted now. What varies between entities is purely declarative — schema,
 * collection, sortable fields, one categorical filter — and is supplied as
 * configuration.
 *
 * This is the resource layer only: the frontend twin of a backend repository.
 * It is where URLs and verbs live, and it contains no React, no caching, and no
 * entity-specific business logic. The *UI* generalization (`EntityListView`,
 * descriptors) remains deferred to M3/M4 exactly as
 * docs/frontend/IMPLEMENTATION_PLAN.md requires, because UI shape is not
 * something the backend has already proven uniform.
 */

import { endpoints, type EntityCollection } from "@/shared/api/endpoints"
import type { ResponseValidator } from "@/shared/api/http-client"
import { type HttpClient, httpClient, type QueryParams } from "@/shared/api/http-client"
import { omitUndefined } from "@/shared/lib/casing"
import { type Page, pageSchema } from "@/shared/schemas/page.schema"
import type { UnknownRecord } from "@/shared/types/utility"

/** Options every resource call accepts — cancellation comes from the query layer. */
export interface ResourceCallOptions {
  signal?: AbortSignal
}

export interface EntityResourceConfig<TRead, TCreate, TUpdate, TListParams> {
  /** Which backend collection this resource addresses. */
  collection: EntityCollection
  /** Validates and shapes a single entity from the wire. */
  readSchema: ResponseValidator<TRead>
  /** Domain create input → wire request body (snake_case, computed fields stripped). */
  toCreateBody: (input: TCreate) => UnknownRecord
  /** Domain patch → wire request body. Receives only changed fields. */
  toUpdateBody: (patch: TUpdate) => UnknownRecord
  /** Domain list params → wire query string params. */
  toListQuery: (params: TListParams) => QueryParams
  /** Overridable for testing; defaults to the app-wide client. */
  client?: HttpClient
}

export interface EntityResource<TRead, TCreate, TUpdate, TListParams> {
  list: (params: TListParams, options?: ResourceCallOptions) => Promise<Page<TRead>>
  get: (id: string, options?: ResourceCallOptions) => Promise<TRead>
  create: (input: TCreate, options?: ResourceCallOptions) => Promise<TRead>
  update: (id: string, patch: TUpdate, options?: ResourceCallOptions) => Promise<TRead>
  remove: (id: string, options?: ResourceCallOptions) => Promise<void>
}

/**
 * Build the five standard resource functions for an entity collection.
 *
 * @example
 *   export const charactersApi = createEntityResource({
 *     collection: "characters",
 *     readSchema: CharacterSchema,
 *     toCreateBody: toCharacterCreateBody,
 *     toUpdateBody: toCharacterUpdateBody,
 *     toListQuery: toCharacterListQuery,
 *   })
 */
export function createEntityResource<TRead, TCreate, TUpdate, TListParams>(
  config: EntityResourceConfig<TRead, TCreate, TUpdate, TListParams>,
): EntityResource<TRead, TCreate, TUpdate, TListParams> {
  const client = config.client ?? httpClient
  const paths = endpoints.entity(config.collection)
  const listSchema = pageSchema(config.readSchema)

  return {
    list(params, options) {
      return client.get<Page<TRead>>(paths.list(), {
        query: config.toListQuery(params),
        schema: listSchema,
        signal: options?.signal,
      })
    },

    get(id, options) {
      return client.get<TRead>(paths.detail(id), {
        schema: config.readSchema,
        signal: options?.signal,
      })
    },

    create(input, options) {
      return client.post<TRead>(paths.create(), config.toCreateBody(input), {
        schema: config.readSchema,
        signal: options?.signal,
      })
    },

    update(id, patch, options) {
      const body = omitUndefined(config.toUpdateBody(patch))

      // The backend rejects an empty update with a 422 — `if not
      // self.model_fields_set` on every *Update DTO (see
      // backend/src/narrative_mind/domain/character.py). Reaching here with
      // nothing to send is a caller bug: `diffForUpdate` is what decides whether
      // an update should happen at all.
      if (Object.keys(body).length === 0) {
        throw new Error(
          `Refusing to send an empty update to ${paths.detail(id)} — the backend rejects it with 422. ` +
            `Use diffForUpdate() and skip the mutation when it returns null.`,
        )
      }

      return client.patch<TRead>(paths.detail(id), body, {
        schema: config.readSchema,
        signal: options?.signal,
      })
    },

    async remove(id, options) {
      await client.delete(paths.detail(id), { signal: options?.signal })
    },
  }
}

/**
 * Compute the changed-fields-only patch for an update.
 *
 * Two backend facts drive this (docs/frontend/API_INTEGRATION_PLAN.md §3,
 * gotchas #3 and #4):
 *
 *  - `Update` DTOs are dumped with `exclude_none=True`, so sending
 *    `field: null` does **not** clear a value — nulls are dropped server-side.
 *  - An update with no set fields is rejected with a 422.
 *
 * So the client sends only fields that genuinely changed, and returns `null`
 * when nothing did, letting the caller skip the request entirely.
 */
export function diffForUpdate<T extends UnknownRecord>(
  original: T,
  next: Partial<T>,
): Partial<T> | null {
  const patch: UnknownRecord = {}

  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue
    if (isEqual(value, original[key])) continue
    patch[key] = value
  }

  return Object.keys(patch).length === 0 ? null : (patch as Partial<T>)
}

/**
 * Value equality sufficient for form-field comparison: primitives by identity,
 * arrays element-wise (aliases), everything else by JSON shape. The entity
 * fields in this backend are primitives and string arrays, so this is exact for
 * the data it actually sees.
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => isEqual(item, b[index]))
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}
