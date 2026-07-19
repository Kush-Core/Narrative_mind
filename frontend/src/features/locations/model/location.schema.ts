/**
 * The Location contract — Zod schemas mirroring the backend's Pydantic triad,
 * plus the wire↔domain mappers (docs/frontend/API_INTEGRATION_PLAN.md §3, D7).
 *
 * This file is the **only** place snake_case appears for this entity. Every
 * component, hook, and page above it sees camelCase
 * (the anti-corruption boundary, architecture §5).
 *
 * Verified against `backend/src/narrative_mind/domain/location.py`:
 *   - `name`        1–120, whitespace-stripped, must not be blank
 *   - `region`      ≤120, nullable — **free text, not an enum**
 *   - `description` ≤2000, nullable
 *
 * Unlike Character there is no computed field: `Location` adds only `id` and
 * `created_at` to its base, so the read model is a straight mapping.
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
import type { UnknownRecord } from "@/shared/types/utility"

/* -------------------------------------------------------------- form model */

/** Mirrors `LocationBase.region`: optional free text, ≤120 characters. */
export const RegionSchema = boundedTextSchema(120)

/**
 * The create/edit form shape. Bounds mirror the backend exactly so invalid
 * input is caught before a request leaves the browser — and so the messages the
 * user sees are ours (specific and friendly) rather than Pydantic's.
 *
 * `region` and `description` are empty strings in the form rather than `null`,
 * because an empty input is `""`; the mappers convert on the way out.
 */
export const LocationFormSchema = z.object({
  name: EntityNameSchema,
  region: RegionSchema,
  description: LongTextSchema,
})

export type LocationForm = z.infer<typeof LocationFormSchema>

export const EMPTY_LOCATION_FORM: LocationForm = {
  name: "",
  region: "",
  description: "",
}

/* -------------------------------------------------------------- read model */

/** A Location as the backend returns it, mapped to the app's shape. */
export const LocationSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    region: z.string().nullish(),
    description: z.string().nullish(),
    created_at: IsoDateStringSchema,
  })
  .transform((wire) => ({
    id: wire.id,
    name: wire.name,
    region: wire.region ?? null,
    description: wire.description ?? null,
    createdAt: wire.created_at,
  }))

export type Location = z.infer<typeof LocationSchema>

/* ------------------------------------------------------------ list params */

/** Sortable columns, matching `LocationRepository._SORTABLE` exactly. */
export const LOCATION_SORT_FIELDS = ["name", "created_at", "region"] as const

/**
 * The `region` filter is an **equality** match on an open-ended string
 * (`l.region = $region` in `location_repo._list_tx`) — not a substring search
 * and not a closed enum. It is therefore modelled as free text and surfaced as
 * a text filter, which is what motivated the `kind` discriminator on
 * `EntityFilterSpec` (docs/frontend/COMPONENT_HIERARCHY.md §5).
 *
 * A blank value is dropped rather than sent: the backend declares
 * `min_length=1`, so an empty `region` would be a 422 rather than "no filter".
 */
export const LocationListParamsSchema = listParamsSchema(LOCATION_SORT_FIELDS, {
  region: z.string().trim().min(1).optional().catch(undefined),
})

export type LocationListParams = z.infer<typeof LocationListParamsSchema>

/* ----------------------------------------------------------------- mappers */

/**
 * Form → create body.
 *
 * Empty optional text is sent as `null` to match the backend's `str | None`
 * defaults, so an unfilled field is absent rather than stored as `""`.
 */
export function toLocationCreateBody(form: LocationForm): UnknownRecord {
  return {
    name: form.name,
    region: emptyToNull(form.region),
    description: emptyToNull(form.description),
  }
}

/**
 * Form patch → update body.
 *
 * Only the fields that actually changed reach here (`diffForUpdate` upstream).
 *
 * Note the asymmetry with create: the backend dumps updates with
 * `exclude_none=True`, so a `null` would be **dropped rather than clearing the
 * field** (gotcha #3). Clearing a region or description is therefore expressed
 * as the empty string, which the backend does store.
 */
export function toLocationUpdateBody(patch: Partial<LocationForm>): UnknownRecord {
  const body: UnknownRecord = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.region !== undefined) body.region = patch.region
  if (patch.description !== undefined) body.description = patch.description
  return body
}

/** Read model → form values, for the edit flow. */
export function toLocationForm(location: Location): LocationForm {
  return {
    name: location.name,
    region: location.region ?? "",
    description: location.description ?? "",
  }
}

function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value
}
