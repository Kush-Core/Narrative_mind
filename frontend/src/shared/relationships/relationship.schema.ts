/**
 * The relationship write contract.
 *
 * Mirrors `CharacterRelationshipCreate` in `domain/character.py`:
 *
 *     { rel_type: str, target_id: str, sentiment: str | None }
 *
 * and the handler's response, which echoes the resolved edge:
 *
 *     { source_id, target_id, rel_type, sentiment }
 *
 * The form shape is separate from the wire shape for the usual reason (the app
 * is camelCase, the wire is snake_case), and because the form carries one field
 * the wire never sees: `sourceId`, which is a path segment rather than a body
 * field.
 */

import { z } from "zod"

import { RELATIONSHIP_TYPES } from "@/shared/domain/relationships"
import { IdSchema } from "@/shared/schemas/primitives"

/**
 * The backend's own bound on `sentiment` is only that it is a string; this cap
 * is the client's, to keep a free-text field from becoming a paragraph in a
 * space that renders it as a chip.
 */
export const SENTIMENT_MAX_LENGTH = 80

/**
 * What the dialog collects.
 *
 * Both ids are required here even though one is always prefilled: the schema
 * describes a *complete* relationship, and "which end was prefilled" is a
 * property of how the dialog was opened, not of the data.
 */
export const RelationshipFormSchema = z.object({
  sourceId: z.string().min(1, "Choose a character to connect from."),
  relType: z.enum(RELATIONSHIP_TYPES, { message: "Choose a relationship type." }),
  targetId: z.string().min(1, "Choose an entity to connect to."),
  sentiment: z.string().trim().max(SENTIMENT_MAX_LENGTH).optional(),
})

export type RelationshipForm = z.infer<typeof RelationshipFormSchema>

/** The created edge, as the backend reports it back. */
export const RelationshipSchema = z
  .object({
    source_id: IdSchema,
    target_id: IdSchema,
    rel_type: z.string(),
    sentiment: z.string().nullish(),
  })
  .transform((wire) => ({
    sourceId: wire.source_id,
    targetId: wire.target_id,
    relType: wire.rel_type,
    sentiment: wire.sentiment ?? undefined,
  }))

export type Relationship = z.infer<typeof RelationshipSchema>

/**
 * Form values → request body.
 *
 * `sourceId` is dropped because it addresses the endpoint rather than travelling
 * in it. `sentiment` is sent only when it has content and only when the type
 * supports it — the caller applies that rule, since it owns the type catalog.
 */
export function toRelationshipBody(form: RelationshipForm): Record<string, unknown> {
  const sentiment = form.sentiment?.trim()

  return {
    rel_type: form.relType,
    target_id: form.targetId,
    // Omitted rather than sent as null: the backend only writes the property
    // when it is provided, and an explicit null would clear a sentiment that a
    // re-created edge already carried.
    ...(sentiment ? { sentiment } : {}),
  }
}
