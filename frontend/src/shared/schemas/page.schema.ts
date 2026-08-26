/**
 * The paginated-collection contract, in one place.
 *
 * The backend returns `{items, total, limit, offset}` and — critically — does
 * **not** serialize `has_more`: `Page.has_more` is a plain Python `@property`,
 * not a Pydantic field, so it never reaches the wire
 * (backend/src/narrative_mind/domain/common.py,
 * docs/frontend/API_INTEGRATION_PLAN.md §3 gotcha #1).
 *
 * This module is the single place that fact is handled. `hasMore` is *derived*
 * here during parsing, so no component, hook, or resource function ever looks
 * for a server-provided `has_more`, and the derivation cannot drift between
 * entities.
 */

import { z } from "zod"

import { LimitSchema, OffsetSchema } from "@/shared/schemas/primitives"

/** A parsed, client-complete page of `T`. */
export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  /** Derived client-side — never sent by the backend. */
  hasMore: boolean
}

/** Anything that can validate and narrow one item — any Zod schema satisfies this. */
export interface ItemValidator<T> {
  parse: (input: unknown) => T
}

/** The envelope the backend actually sends, before items are validated. */
const PageEnvelopeSchema = z.object({
  items: z.array(z.unknown()),
  total: z.number().int().min(0),
  limit: LimitSchema,
  offset: OffsetSchema,
})

/**
 * Build a `Page` schema for a given item schema.
 *
 * Generic over the item validator so every entity gets identical pagination
 * semantics from one implementation (DRY, architecture §2.3).
 *
 * The envelope is validated by Zod and the items are then mapped through the
 * item validator, rather than nesting it in `z.array(...)`. That keeps the
 * parameter structurally typed — so the resource layer can pass the same
 * validator it hands the HTTP client, with no cast anywhere. A bad item still
 * throws, and the HTTP client turns that into a single `parse` ApiError.
 */
export function pageSchema<T>(itemSchema: ItemValidator<T>) {
  return PageEnvelopeSchema.transform((page): Page<T> => ({
    items: page.items.map((item) => itemSchema.parse(item)),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    hasMore: deriveHasMore(page.offset, page.items.length, page.total),
  }))
}

/**
 * `hasMore` mirrors the backend's own `Page.has_more` definition
 * (`offset + len(items) < total`), reimplemented client-side because the value
 * is not serialized.
 */
export function deriveHasMore(offset: number, itemCount: number, total: number): boolean {
  return offset + itemCount < total
}

/** An empty page, for placeholder and fallback states. */
export function emptyPage<T>(limit: number, offset = 0): Page<T> {
  return { items: [], total: 0, limit, offset, hasMore: false }
}
