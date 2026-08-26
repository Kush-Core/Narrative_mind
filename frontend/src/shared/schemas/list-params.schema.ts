/**
 * The list-query contract shared by every collection endpoint.
 *
 * All four entity list endpoints accept the *same* parameter set — `limit`,
 * `offset`, `name_contains`, `sort_by`, `order` — differing only in which
 * `sort_by` values they accept and whether they add one categorical filter
 * (backend/src/narrative_mind/api/routers/). That shared core is defined once
 * here; the varying parts are supplied by each entity when it lands.
 *
 * Because list state lives in the URL (docs/frontend/STATE_MANAGEMENT.md §3),
 * this schema is also what makes a hand-edited query string safe: it coerces,
 * clamps, and drops anything malformed so the client can never issue a request
 * the backend would reject.
 */

import { z } from "zod"

import { LimitSchema, OffsetSchema, SortOrderSchema } from "@/shared/schemas/primitives"

/**
 * Parameters common to every list request, in app (camelCase) form.
 *
 * `sortBy` is intentionally a plain string here: the *valid* values differ per
 * entity, and the backend silently falls back to `name` for anything outside its
 * whitelist (docs/frontend/API_INTEGRATION_PLAN.md §3 gotcha #7). Each entity
 * narrows it with `listParamsSchema(...)` so the UI can only ever offer sorts
 * the backend honours.
 */
export const BaseListParamsSchema = z.object({
  limit: LimitSchema,
  offset: OffsetSchema,
  nameContains: z.string().trim().min(1).optional(),
  sortBy: z.string().min(1).default("name"),
  order: SortOrderSchema.default("asc"),
})

export type BaseListParams = z.infer<typeof BaseListParamsSchema>
export type ListParamsInput = z.input<typeof BaseListParamsSchema>

/**
 * Build an entity's list-parameter schema: the shared core, with `sortBy`
 * narrowed to that entity's sortable fields and any extra categorical filter
 * merged in.
 *
 * Unknown/invalid values fall back to the entity's default sort rather than
 * failing the parse, which is what makes a stale or hand-edited URL degrade
 * gracefully instead of erroring.
 *
 * @example
 *   const CharacterListParamsSchema = listParamsSchema(
 *     ["name", "created_at", "status"],
 *     { status: CharacterStatusSchema.optional() },
 *   )
 */
export function listParamsSchema<
  const TSortFields extends readonly [string, ...string[]],
  // `Record<never, never>` — an empty shape — rather than `Record<string, never>`.
  // The latter carries a *string index signature*, and spreading it into
  // `.extend()` propagates that signature to the result: every param type
  // collapses to `never`, so the whole schema infers as `Record<string, never>`.
  // It went unnoticed while all three entities passed a filter shape; Event is
  // the first with no categorical filter and so the first to take this default.
  TFilters extends z.ZodRawShape = Record<never, never>,
>(sortableFields: TSortFields, filters?: TFilters) {
  const defaultSort = sortableFields[0]

  return BaseListParamsSchema.extend({
    sortBy: z.preprocess(
      (value) => (sortableFields.includes(value as TSortFields[number]) ? value : defaultSort),
      z.enum(sortableFields),
    ),
    ...(filters ?? ({} as TFilters)),
  })
}

/**
 * Convert app-shaped list params to the backend's snake_case query string.
 *
 * Only the shared core is translated here; entity-specific filters
 * (`status`, `region`, `ideology`) already use wire-identical names and are
 * passed through untouched. Empty and undefined values are dropped so the URL
 * carries only meaningful parameters.
 */
export function listParamsToQuery(
  params: BaseListParams & Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  const { limit, offset, nameContains, sortBy, order, ...filters } = params

  const query: Record<string, string | number | boolean | undefined> = {
    limit,
    offset,
    sort_by: sortBy,
    order,
    name_contains: nameContains,
  }

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      query[key] = value
    }
  }

  return query
}
