/**
 * Cross-cutting Zod primitives (docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.4).
 *
 * These encode constraints that are *shared by every entity* in the backend
 * contract, so entity schemas compose them instead of restating the same bounds
 * four times. Pure: no React, no fetch.
 *
 * Anything genuinely entity-specific (aliases ≤10, `timeline_order`, the
 * `status` enum) belongs in that entity's own schema file, not here.
 */

import { z } from "zod"

/**
 * Node identifiers are UUID4 strings by default, but the backend accepts any
 * string `id` and its `Character` read model allows an `id`/`uuid` alias
 * (`AliasChoices` in backend/src/narrative_mind/domain/character.py). Validating
 * as a non-empty string rather than a strict UUID keeps the client from
 * rejecting ids the backend considers perfectly valid.
 */
export const IdSchema = z.string().min(1, "id must not be empty")

/**
 * `created_at` is written by the backend as an ISO-8601 UTC string, but it is a
 * plain string field with no server-side format guarantee
 * (docs/frontend/API_INTEGRATION_PLAN.md §3, gotcha #6). It is therefore parsed
 * permissively as a string; `parseIsoDate` in `shared/lib/date.ts` is the
 * defensive path to a `Date`.
 */
export const IsoDateStringSchema = z.string()

/** Mirrors the backend's shared `name` bounds (1–120, whitespace-stripped). */
export const EntityNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(120, "Name must be 120 characters or fewer")

/**
 * Optional free text with a backend-declared upper bound.
 *
 * The backend's optional string fields differ only in that bound — `region`
 * ≤120, `ideology` ≤500, `description`/`summary` ≤2000
 * (backend/src/narrative_mind/domain/) — so the shape is written once and the
 * bound is the parameter. Trimming matches `str_strip_whitespace` on every
 * entity's `model_config`.
 */
export function boundedTextSchema(max: number) {
  return z.string().trim().max(max, `Must be ${max} characters or fewer`)
}

/** Mirrors the backend's shared `description`/`summary` bound (≤2000). */
export const LongTextSchema = boundedTextSchema(2000)

/** `SortOrder` (backend/src/narrative_mind/domain/common.py). */
export const SortOrderSchema = z.enum(["asc", "desc"])
export type SortOrder = z.infer<typeof SortOrderSchema>

/**
 * Pagination bounds, matching the backend's `pagination_params` dependency
 * exactly (`limit` 1–100 default 20, `offset` ≥ 0). Enforcing them client-side
 * means the app never issues a request the backend would reject with a 422.
 */
export const PAGINATION = {
  defaultLimit: 20,
  minLimit: 1,
  maxLimit: 100,
  minOffset: 0,
} as const

export const LimitSchema = z.coerce
  .number()
  .int()
  .min(PAGINATION.minLimit)
  .max(PAGINATION.maxLimit)
  .default(PAGINATION.defaultLimit)

export const OffsetSchema = z.coerce.number().int().min(PAGINATION.minOffset).default(0)
