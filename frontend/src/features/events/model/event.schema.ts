/**
 * The Event contract — Zod schemas mirroring the backend's Pydantic triad,
 * plus the wire↔domain mappers (docs/frontend/API_INTEGRATION_PLAN.md §3, D7).
 *
 * This file is the **only** place snake_case appears for this entity. Every
 * component, hook, and page above it sees camelCase
 * (the anti-corruption boundary, architecture §5).
 *
 * Verified against `backend/src/narrative_mind/domain/event.py`:
 *   - `name`           1–120, whitespace-stripped, must not be blank
 *   - `summary`        ≤2000, nullable
 *   - `timeline_order` plain `int`, **default 0, not nullable**
 *
 * Event departs from the first three entities in two ways worth naming:
 *
 *  1. `timeline_order` is the app's first **numeric** field, and the first that
 *     is *required with a default* rather than optional-and-nullable. It does
 *     not go through `emptyToNull`: zero is a real position, not "unset".
 *  2. It is the first field whose **wire name differs from its app name**
 *     (`timeline_order` vs `timelineOrder`), which is why the read mapper spells
 *     the conversion out and `pickDefined` now snake-cases on the way back.
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

/* -------------------------------------------------------------- form model */

/**
 * The event's position on the world timeline.
 *
 * The backend declares a bare `int` with no bounds, so the only real limits are
 * the ones JavaScript imposes — `z.int()` enforces the safe-integer range, which
 * keeps a pasted 1e21 from silently losing precision on the way to Neo4j.
 *
 * Negative values are deliberately allowed: prehistory needs somewhere to go,
 * and the backend accepts them.
 */
export const TimelineOrderSchema = z.int({
  error: "Timeline position must be a whole number",
})

/**
 * The create/edit form shape. Bounds mirror the backend exactly so invalid
 * input is caught before a request leaves the browser — and so the messages the
 * user sees are ours (specific and friendly) rather than Pydantic's.
 */
export const EventFormSchema = z.object({
  name: EntityNameSchema,
  summary: LongTextSchema,
  timelineOrder: TimelineOrderSchema,
})

export type EventForm = z.infer<typeof EventFormSchema>

/** Matches the backend's own `timeline_order` default. */
export const EMPTY_EVENT_FORM: EventForm = {
  name: "",
  summary: "",
  timelineOrder: 0,
}

/* -------------------------------------------------------------- read model */

/** An Event as the backend returns it, mapped to the app's shape. */
export const EventSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    summary: z.string().nullish(),
    // Defaulted rather than required: a node written before the field existed
    // would otherwise make the whole record unreadable.
    timeline_order: z.number().int().catch(0).default(0),
    created_at: IsoDateStringSchema,
  })
  .transform((wire) => ({
    id: wire.id,
    name: wire.name,
    summary: wire.summary ?? null,
    timelineOrder: wire.timeline_order,
    createdAt: wire.created_at,
  }))

export type Event = z.infer<typeof EventSchema>

/* ------------------------------------------------------------ list params */

/**
 * Sortable columns, matching `EventRepository._SORTABLE` exactly.
 *
 * `timeline_order` leads: chronological order is the way a writer reads a
 * timeline, so it is the sensible default rather than alphabetical. The first
 * entry is what `listParamsSchema` falls back to.
 */
export const EVENT_SORT_FIELDS = ["timeline_order", "name", "created_at"] as const

/**
 * Event is the only entity with **no categorical filter** — its list endpoint
 * accepts `name_contains` and nothing else
 * (backend/src/narrative_mind/api/routers/events.py). The
 * descriptor simply omits `filter`, and `EntityListView` renders search alone;
 * no engine change was needed to express "this entity has no filter".
 */
export const EventListParamsSchema = listParamsSchema(EVENT_SORT_FIELDS)

export type EventListParams = z.infer<typeof EventListParamsSchema>

/* ----------------------------------------------------------------- mappers */

/** Every field a client may write. Nothing else can reach an update body. */
const WRITABLE_FIELDS = ["name", "summary", "timelineOrder"] as const

/**
 * Form → create body.
 *
 * An empty summary is sent as `null` to match `str | None`. `timelineOrder` is
 * **not** given that treatment — it is a required `int` whose zero is a
 * meaningful position, so it is always sent as a number.
 */
export function toEventCreateBody(form: EventForm): UnknownRecord {
  return {
    name: form.name,
    summary: emptyToNull(form.summary),
    timeline_order: form.timelineOrder,
  }
}

/**
 * Form patch → update body.
 *
 * Only the fields that actually changed reach here (`diffForUpdate` upstream).
 * `pickDefined` converts `timelineOrder` → `timeline_order`; without that the
 * backend would not recognise the field and would drop it silently.
 */
export function toEventUpdateBody(patch: Partial<EventForm>): UnknownRecord {
  return pickDefined(patch, WRITABLE_FIELDS)
}

/** Read model → form values, for the edit flow. */
export function toEventForm(event: Event): EventForm {
  return {
    name: event.name,
    summary: event.summary ?? "",
    timelineOrder: event.timelineOrder,
  }
}
