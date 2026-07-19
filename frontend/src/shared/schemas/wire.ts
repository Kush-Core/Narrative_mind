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
 * both **defined** and **explicitly writable**.
 *
 * The allow-list is the load-bearing part. Server-owned and computed fields
 * (`id`, `created_at`, Character's `display_name`) must never be echoed back on
 * a write, and an allow-list makes that structural rather than something each
 * mapper has to remember to omit. `undefined` means "not in this patch";
 * `""` means "clear this field" and is passed through deliberately.
 */
export function pickDefined<TForm extends UnknownRecord>(
  patch: Partial<TForm>,
  writableFields: readonly Extract<keyof TForm, string>[],
): UnknownRecord {
  const body: UnknownRecord = {}
  for (const field of writableFields) {
    const value = patch[field]
    if (value !== undefined) body[field] = value
  }
  return body
}
