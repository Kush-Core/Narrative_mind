/**
 * The Faction contract — Zod schemas mirroring the backend's Pydantic triad,
 * plus the wire↔domain mappers (docs/frontend/API_INTEGRATION_PLAN.md §3, D7).
 *
 * This file is the **only** place snake_case appears for this entity. Every
 * component, hook, and page above it sees camelCase
 * (the anti-corruption boundary, architecture §5).
 *
 * Verified against `backend/src/narrative_mind/domain/faction.py`:
 *   - `name`        1–120, whitespace-stripped, must not be blank
 *   - `ideology`    ≤500, nullable — free text, not an enum
 *   - `description` ≤2000, nullable
 *
 * Structurally identical to Location apart from the bound on its optional text
 * field (500 vs 120), which is exactly why almost nothing here is hand-written:
 * the bound is a parameter to `boundedTextSchema` and the mappers are the
 * shared wire helpers.
 */

import { z } from "zod"

import { listParamsSchema } from "@/shared/schemas/list-params.schema"
import {
  boundedTextSchema,
  EntityNameSchema,
  IdSchema,
  IsoDateStringSchema,
  LongTextSchema,
} from "@/shared/schemas/primitives"
import { emptyToNull, pickDefined } from "@/shared/schemas/wire"
import type { UnknownRecord } from "@/shared/types/utility"

/* -------------------------------------------------------------- form model */

/** Mirrors `FactionBase.ideology`: optional free text, ≤500 characters. */
export const IdeologySchema = boundedTextSchema(500)

/**
 * The create/edit form shape. Bounds mirror the backend exactly so invalid
 * input is caught before a request leaves the browser — and so the messages the
 * user sees are ours (specific and friendly) rather than Pydantic's.
 *
 * `ideology` and `description` are empty strings in the form rather than `null`,
 * because an empty input is `""`; the mappers convert on the way out.
 */
export const FactionFormSchema = z.object({
  name: EntityNameSchema,
  ideology: IdeologySchema,
  description: LongTextSchema,
})

export type FactionForm = z.infer<typeof FactionFormSchema>

export const EMPTY_FACTION_FORM: FactionForm = {
  name: "",
  ideology: "",
  description: "",
}

/* -------------------------------------------------------------- read model */

/** A Faction as the backend returns it, mapped to the app's shape. */
export const FactionSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    ideology: z.string().nullish(),
    description: z.string().nullish(),
    created_at: IsoDateStringSchema,
  })
  .transform((wire) => ({
    id: wire.id,
    name: wire.name,
    ideology: wire.ideology ?? null,
    description: wire.description ?? null,
    createdAt: wire.created_at,
  }))

export type Faction = z.infer<typeof FactionSchema>

/* ------------------------------------------------------------ list params */

/** Sortable columns, matching `FactionRepository._SORTABLE` exactly. */
export const FACTION_SORT_FIELDS = ["name", "created_at", "ideology"] as const

/**
 * Like Location's `region`, the `ideology` filter is an **equality** match on an
 * open-ended string (`f.ideology = $ideology` in `faction_repo._list_tx`) — so
 * it is a `kind: "text"` filter, not a select.
 *
 * A blank value is dropped rather than sent: the backend declares
 * `min_length=1`, so an empty `ideology` would be a 422 rather than "no filter".
 */
export const FactionListParamsSchema = listParamsSchema(FACTION_SORT_FIELDS, {
  ideology: z.string().trim().min(1).optional().catch(undefined),
})

export type FactionListParams = z.infer<typeof FactionListParamsSchema>

/* ----------------------------------------------------------------- mappers */

/** Every field a client may write. Nothing else can reach an update body. */
const WRITABLE_FIELDS = ["name", "ideology", "description"] as const

/**
 * Form → create body.
 *
 * Empty optional text is sent as `null` to match the backend's `str | None`
 * defaults, so an unfilled field is absent rather than stored as `""`.
 */
export function toFactionCreateBody(form: FactionForm): UnknownRecord {
  return {
    name: form.name,
    ideology: emptyToNull(form.ideology),
    description: emptyToNull(form.description),
  }
}

/**
 * Form patch → update body.
 *
 * Only the fields that actually changed reach here (`diffForUpdate` upstream).
 * Clearing a field is expressed as `""`, not `null`, because the backend's
 * `exclude_none=True` dump would drop a null (gotcha #3).
 */
export function toFactionUpdateBody(patch: Partial<FactionForm>): UnknownRecord {
  return pickDefined(patch, WRITABLE_FIELDS)
}

/** Read model → form values, for the edit flow. */
export function toFactionForm(faction: Faction): FactionForm {
  return {
    name: faction.name,
    ideology: faction.ideology ?? "",
    description: faction.description ?? "",
  }
}
