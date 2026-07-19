/**
 * Write-mapping helpers shared by every entity schema
 * (docs/frontend/API_INTEGRATION_PLAN.md §3).
 *
 * Each entity's schema file owns *what* its fields mean; these are the two
 * mechanical operations all of them were repeating. Both encode a backend fact
 * rather than a stylistic preference, which is why they belong in one place:
 * getting either wrong silently corrupts a write.
 *
 * Pure — no React, no fetch, no Zod.
 */

import { camelToSnake } from "@/shared/lib/casing"
import type { UnknownRecord } from "@/shared/types/utility"

/**
 * Form value → wire value for an **optional** backend string field, on create.
 *
 * An untouched input is `""`, but the backend types these fields as
 * `str | None` with a `None` default. Sending `""` would store an empty string
 * where "not set" was meant, so a blank becomes `null`.
 *
 * Note this is a **create-only** rule. On update the asymmetry reverses: the
 * backend dumps patches with `exclude_none=True`, so a `null` is dropped rather
 * than clearing the field, and a deliberate clear must be sent as `""`
 * (gotcha #3). That is why update bodies go through `pickDefined`, which passes
 * the empty string through untouched.
 */
export function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value
}

/**
 * Build a wire update body from a form patch, copying only the fields that are
 * both **defined** and **explicitly writable**, with each key converted to the
 * backend's snake_case.
 *
 * The allow-list is the load-bearing part. Server-owned and computed fields
 * (`id`, `created_at`, Character's `display_name`) must never be echoed back on
 * a write, and an allow-list makes that structural rather than something each
 * mapper has to remember to omit. `undefined` means "not in this patch";
 * `""` means "clear this field" and is passed through deliberately.
 *
 * **On the casing conversion.** Through Faction every writable field was a
 * single word (`name`, `status`, `region`, `ideology`), so form keys and wire
 * keys happened to coincide and this helper could copy them verbatim. Event's
 * `timelineOrder` → `timeline_order` is the first field where they diverge, and
 * the silent-failure mode is nasty: an unconverted key is simply not a field the
 * backend knows, so `exclude_none` drops it and the update reports success while
 * changing nothing.
 *
 * Converting here rather than per-entity is safe *because the whole backend is
 * uniformly snake_case* (a verified fact, analysis §DTOs), and it fails safe:
 * every future multi-word field is handled without anyone remembering to. Note
 * this converts **allow-listed top-level keys only** — never nested payload
 * data, which is the corruption case `shared/lib/casing.ts` warns about.
 */
export function pickDefined<TForm extends UnknownRecord>(
  patch: Partial<TForm>,
  writableFields: readonly Extract<keyof TForm, string>[],
): UnknownRecord {
  const body: UnknownRecord = {}
  for (const field of writableFields) {
    const value = patch[field]
    if (value !== undefined) body[camelToSnake(field)] = value
  }
  return body
}
