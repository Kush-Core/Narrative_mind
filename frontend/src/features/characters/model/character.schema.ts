/**
 * The Character contract — Zod schemas mirroring the backend's Pydantic triad,
 * plus the wire↔domain mappers (docs/frontend/API_INTEGRATION_PLAN.md §3, D7).
 *
 * This file is the **only** place snake_case appears for this entity. Every
 * component, hook, and page above it sees camelCase
 * (the anti-corruption boundary, architecture §5).
 *
 * Verified against `backend/src/narrative_mind/domain/character.py`:
 *   - `name`        1–120, whitespace-stripped, must not be blank
 *   - `aliases`     ≤10, trimmed, deduped case-insensitively
 *   - `status`      CharacterStatus enum, default `alive`
 *   - `description` ≤2000, nullable
 *   - `display_name` is a real `@computed_field` — it *is* serialized, and is
 *     read-only: it must never be echoed back on a write (gotcha #5)
 */

import { z } from "zod"

import { listParamsSchema } from "@/shared/schemas/list-params.schema"
import {
  EntityNameSchema,
  IdSchema,
  IsoDateStringSchema,
  LongTextSchema,
} from "@/shared/schemas/primitives"
import { emptyToNull, pickDefined } from "@/shared/schemas/wire"
import type { UnknownRecord } from "@/shared/types/utility"

/* ------------------------------------------------------------------ status */

export const CHARACTER_STATUSES = ["alive", "dead", "unknown"] as const

export const CharacterStatusSchema = z.enum(CHARACTER_STATUSES)
export type CharacterStatus = z.infer<typeof CharacterStatusSchema>

export const CHARACTER_STATUS_OPTIONS = [
  { value: "alive", label: "Alive" },
  { value: "dead", label: "Dead" },
  { value: "unknown", label: "Unknown" },
] as const

/* -------------------------------------------------------------- form model */

/**
 * The create/edit form shape. Bounds mirror the backend exactly so invalid
 * input is caught before a request leaves the browser — and so the messages the
 * user sees are ours (specific and friendly) rather than Pydantic's.
 *
 * `description` is an empty string in the form rather than `null`, because an
 * empty textarea is `""`; the mapper converts on the way out.
 */
export const CharacterFormSchema = z.object({
  name: EntityNameSchema,
  aliases: z
    .array(z.string().trim().min(1))
    .max(10, "At most 10 aliases")
    // Mirrors `CharacterBase.dedupe_aliases`: the backend silently drops
    // case-insensitive duplicates, so the client normalizes rather than letting
    // a saved value differ from what was typed.
    .transform((aliases) => {
      const seen = new Set<string>()
      return aliases.reduce<string[]>((kept, alias) => {
        const trimmed = alias.trim()
        const key = trimmed.toLowerCase()
        if (trimmed !== "" && !seen.has(key)) {
          seen.add(key)
          kept.push(trimmed)
        }
        return kept
      }, [])
    }),
  status: CharacterStatusSchema,
  description: LongTextSchema,
})

export type CharacterForm = z.infer<typeof CharacterFormSchema>

export const EMPTY_CHARACTER_FORM: CharacterForm = {
  name: "",
  aliases: [],
  status: "alive",
  description: "",
}

/* -------------------------------------------------------------- read model */

/**
 * A Character as the backend returns it, mapped to the app's shape.
 *
 * `display_name` is parsed when present but also *derived* as a fallback using
 * the backend's own rule, so the UI has a dependable title even if the computed
 * field is ever dropped from the response.
 */
export const CharacterSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    aliases: z.array(z.string()).default([]),
    status: CharacterStatusSchema.catch("unknown"),
    description: z.string().nullish(),
    created_at: IsoDateStringSchema,
    display_name: z.string().optional(),
  })
  .transform((wire) => ({
    id: wire.id,
    name: wire.name,
    aliases: wire.aliases,
    status: wire.status,
    description: wire.description ?? null,
    createdAt: wire.created_at,
    displayName: wire.display_name ?? deriveDisplayName(wire.name, wire.aliases),
  }))

export type Character = z.infer<typeof CharacterSchema>

/** The backend's `display_name` rule: `"<name> (<first alias>)"`, else the name. */
export function deriveDisplayName(name: string, aliases: string[]): string {
  const primary = aliases[0]
  return primary ? `${name} (${primary})` : name
}

/* ------------------------------------------------------------ list params */

/** Sortable columns, matching `CharacterRepository._SORTABLE` exactly. */
export const CHARACTER_SORT_FIELDS = ["name", "created_at", "status"] as const

export const CharacterListParamsSchema = listParamsSchema(CHARACTER_SORT_FIELDS, {
  status: CharacterStatusSchema.optional().catch(undefined),
})

export type CharacterListParams = z.infer<typeof CharacterListParamsSchema>

/* ----------------------------------------------------------------- mappers */

/**
 * Every field a client may write.
 *
 * The list is what keeps the computed, server-owned `display_name` out of a
 * write body structurally rather than by remembering to omit it (gotcha #5).
 */
const WRITABLE_FIELDS = ["name", "aliases", "status", "description"] as const

/**
 * Form → create body.
 *
 * `display_name` is never sent (it is computed server-side), and an empty
 * description is sent as `null` to match the backend's `str | None`.
 */
export function toCharacterCreateBody(form: CharacterForm): UnknownRecord {
  return {
    name: form.name,
    aliases: form.aliases,
    status: form.status,
    description: emptyToNull(form.description),
  }
}

/**
 * Form patch → update body.
 *
 * Only the fields that actually changed reach here (`diffForUpdate` upstream).
 *
 * Note the `description` asymmetry: the backend dumps updates with
 * `exclude_none=True`, so a `null` would be **dropped rather than clearing the
 * field** (gotcha #3). Clearing a description is therefore expressed as the
 * empty string, which the backend does store.
 */
export function toCharacterUpdateBody(patch: Partial<CharacterForm>): UnknownRecord {
  return pickDefined(patch, WRITABLE_FIELDS)
}

/** Read model → form values, for the edit flow. */
export function toCharacterForm(character: Character): CharacterForm {
  return {
    name: character.name,
    aliases: [...character.aliases],
    status: character.status,
    description: character.description ?? "",
  }
}
