/**
 * The AI wire contract — Zod schemas for all four `/ai/*` endpoints.
 *
 * Verified against `backend/src/narrative_mind/domain/ai.py` (describe, extract)
 * and `domain/rag.py` (retrieve, ask). Unlike the two `/graph` reads, these
 * handlers all declare `response_model=`, so FastAPI guarantees the shape and
 * these schemas are a boundary rather than the only line of defence. They still
 * earn their place: this is the single file in the slice where snake_case
 * exists, and the one place the two *different* meanings of `source`/`target`
 * are disambiguated (see `ExtractedRelationship` below).
 *
 * The request bounds mirror the backend's Pydantic `Field` constraints exactly,
 * so a prompt that would only ever earn a 422 never reaches the wire.
 */

import { z } from "zod"

import { type NodeKind, toNodeKind } from "@/shared/domain/entity-kinds"
import { IdSchema } from "@/shared/schemas/primitives"

/* --------------------------------------------------------------- constants */

/**
 * Input bounds, mirroring the backend `Field(...)` declarations:
 *   ExtractRequest.passage  min_length=10   max_length=5000
 *   Retrieve/AskRequest.question  min_length=1  max_length=1000
 *
 * Held as data rather than inlined so the prompt fields can render the same
 * numbers in their character counters that the schemas enforce.
 */
export const AI_LIMITS = {
  question: { min: 1, max: 1000 },
  passage: { min: 10, max: 5000 },
} as const

/**
 * `DescribeRequest.tone` is a free string server-side — its three `examples`
 * are documentation, not an enum. The app sends one value and exposes no
 * control for it: a tone picker would put a knob on one AI surface and none on
 * the other three, which is precisely the asymmetry this integration avoids.
 */
export const DESCRIBE_TONE = "neutral" as const

/* ---------------------------------------------------------------- describe */

export const DescribeFormSchema = z.object({
  name: z.string().trim().min(1),
  traits: z.array(z.string().trim().min(1)).default([]),
})

export type DescribeForm = z.infer<typeof DescribeFormSchema>

export const DescribeResponseSchema = z.object({
  description: z.string(),
})

export type DescribeResult = z.infer<typeof DescribeResponseSchema>

export function toDescribeBody(input: DescribeForm) {
  return { name: input.name, traits: input.traits, tone: DESCRIBE_TONE }
}

/* ----------------------------------------------------------------- extract */

export const ExtractFormSchema = z.object({
  passage: z
    .string()
    .trim()
    .min(AI_LIMITS.passage.min, `Give at least ${AI_LIMITS.passage.min} characters to work from`)
    .max(AI_LIMITS.passage.max, `Must be ${AI_LIMITS.passage.max} characters or fewer`),
})

export type ExtractForm = z.infer<typeof ExtractFormSchema>

/**
 * `type` is a plain `str` on the wire, but `AIService._filter_extract_response`
 * drops anything outside the four node labels before responding — so mapping it
 * through `toNodeKind` is a translation, not a guess, and an unrecognised label
 * degrades to `Unknown` rather than failing the whole response.
 */
const ExtractedEntitySchema = z
  .object({
    name: z.string(),
    type: z.string(),
  })
  .transform((wire) => ({ name: wire.name, kind: toNodeKind([wire.type]) }))

/**
 * **`source` and `target` here are entity *names*, not ids** — this endpoint
 * never touches the graph, so it has no ids to report. `/ai/retrieve` uses the
 * same two field names for ids. Renaming them at this boundary is what stops a
 * call site from ever confusing the two.
 */
const ExtractedRelationshipSchema = z
  .object({
    source: z.string(),
    rel_type: z.string(),
    target: z.string(),
  })
  .transform((wire) => ({
    sourceName: wire.source,
    targetName: wire.target,
    relType: wire.rel_type,
  }))

export const ExtractResponseSchema = z.object({
  entities: z.array(ExtractedEntitySchema).default([]),
  relationships: z.array(ExtractedRelationshipSchema).default([]),
})

export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>
export type ExtractedRelationship = z.infer<typeof ExtractedRelationshipSchema>
export type ExtractResult = z.infer<typeof ExtractResponseSchema>

/* ---------------------------------------------------- retrieve / ask shared */

export const AskFormSchema = z.object({
  question: z
    .string()
    .trim()
    .min(AI_LIMITS.question.min, "Ask a question first")
    .max(AI_LIMITS.question.max, `Must be ${AI_LIMITS.question.max} characters or fewer`),
})

export type AskForm = z.infer<typeof AskFormSchema>

/**
 * One entity in a retrieval result.
 *
 * `score` is the cosine similarity to the question and is present **only for a
 * seed**; an entity that entered through graph expansion has none. That null is
 * information — it is the difference between "the question matched this" and
 * "this is connected to something the question matched" — so it is preserved as
 * `null` rather than coerced to 0.
 */
const RetrievedEntitySchema = z
  .object({
    id: IdSchema,
    label: z.string(),
    name: z.string(),
    score: z.number().nullish(),
  })
  .transform((wire) => ({
    id: wire.id,
    kind: toNodeKind([wire.label]),
    name: wire.name,
    score: wire.score ?? null,
  }))

/** Edges of the induced subgraph. `source`/`target` are entity **ids** here. */
const RetrievedRelationshipSchema = z
  .object({
    source: IdSchema,
    target: IdSchema,
    rel_type: z.string(),
    sentiment: z.string().nullish(),
  })
  .transform((wire) => ({
    source: wire.source,
    target: wire.target,
    relType: wire.rel_type,
    sentiment: wire.sentiment ?? undefined,
  }))

export const RetrievalResultSchema = z
  .object({
    seeds: z.array(RetrievedEntitySchema).default([]),
    entities: z.array(RetrievedEntitySchema).default([]),
    relationships: z.array(RetrievedRelationshipSchema).default([]),
    context: z.string(),
    char_count: z.number(),
  })
  .transform((wire) => ({
    seeds: wire.seeds,
    entities: wire.entities,
    relationships: wire.relationships,
    context: wire.context,
    charCount: wire.char_count,
  }))

export type RetrievedEntity = z.infer<typeof RetrievedEntitySchema>
export type RetrievedRelationship = z.infer<typeof RetrievedRelationshipSchema>
export type RetrievalResult = z.infer<typeof RetrievalResultSchema>

/* --------------------------------------------------------------------- ask */

/**
 * `citations` are entity ids the backend has **already validated** against the
 * ids it actually retrieved — anything the model invented was dropped server-side
 * and never appears here. The client still checks membership when rendering the
 * prose, because the *inline* bracketed ids in `answer` are raw model output and
 * carry no such guarantee.
 */
export const AskResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(IdSchema).default([]),
  retrieval: RetrievalResultSchema.nullish().transform((value) => value ?? null),
})

export type AskResult = z.infer<typeof AskResponseSchema>

/**
 * The node kinds an AI result can name. Re-exported so consumers in the slice
 * do not each reach into `shared/domain` for the same type.
 */
export type { NodeKind }
