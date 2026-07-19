/**
 * The Event contract, pinned against the real backend model
 * (`backend/src/narrative_mind/domain/event.py`).
 *
 * These tests are the guard on the anti-corruption boundary: if the backend's
 * shape or semantics change, they fail here rather than three screens away.
 *
 * Event carries the two departures from the first three entities — a numeric,
 * non-nullable field and a wire name that differs from its app name — so those
 * get more attention here than the shared shape does.
 */

import { describe, expect, it } from "vitest"

import {
  EVENT_SORT_FIELDS,
  EventFormSchema,
  EventListParamsSchema,
  EventSchema,
  toEventCreateBody,
  toEventForm,
  toEventUpdateBody,
} from "@/features/events/model/event.schema"

const wireEvent = {
  id: "e-1",
  name: "The Sundering",
  summary: "The night the mountain split and the old roads drowned.",
  timeline_order: 12,
  created_at: "2026-07-19T10:00:00+00:00",
}

describe("read model", () => {
  it("maps the wire shape to camelCase domain fields", () => {
    expect(EventSchema.parse(wireEvent)).toEqual({
      id: "e-1",
      name: "The Sundering",
      summary: "The night the mountain split and the old roads drowned.",
      timelineOrder: 12,
      createdAt: "2026-07-19T10:00:00+00:00",
    })
  })

  it("renames timeline_order to timelineOrder — the first wire/app divergence", () => {
    const event = EventSchema.parse(wireEvent)

    expect(event.timelineOrder).toBe(12)
    expect(event).not.toHaveProperty("timeline_order")
  })

  it("normalizes a null summary to null rather than undefined", () => {
    expect(EventSchema.parse({ ...wireEvent, summary: null }).summary).toBeNull()
  })

  it("preserves a zero position rather than treating it as absent", () => {
    // Zero is the backend default *and* a legitimate first position.
    expect(EventSchema.parse({ ...wireEvent, timeline_order: 0 }).timelineOrder).toBe(0)
  })

  it("preserves a negative position, which the backend accepts", () => {
    expect(EventSchema.parse({ ...wireEvent, timeline_order: -50 }).timelineOrder).toBe(-50)
  })

  it("defaults a missing or unusable position instead of failing the record", () => {
    // A node written before the field existed should still be readable.
    const { timeline_order: _omitted, ...withoutOrder } = wireEvent
    expect(EventSchema.parse(withoutOrder).timelineOrder).toBe(0)
    expect(EventSchema.parse({ ...wireEvent, timeline_order: "nonsense" }).timelineOrder).toBe(0)
  })
})

describe("form validation", () => {
  const valid = { name: "The Sundering", summary: "", timelineOrder: 0 }

  it("accepts a minimal valid event", () => {
    expect(EventFormSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects a blank name, matching the backend's name_not_blank validator", () => {
    expect(EventFormSchema.safeParse({ ...valid, name: "   " }).success).toBe(false)
  })

  it("enforces the backend's 120-character name bound", () => {
    expect(EventFormSchema.safeParse({ ...valid, name: "a".repeat(121) }).success).toBe(false)
  })

  it("enforces the 2000-character summary bound", () => {
    expect(EventFormSchema.safeParse({ ...valid, summary: "a".repeat(2001) }).success).toBe(false)
  })

  it("accepts negative and zero positions", () => {
    expect(EventFormSchema.safeParse({ ...valid, timelineOrder: -1 }).success).toBe(true)
    expect(EventFormSchema.safeParse({ ...valid, timelineOrder: 0 }).success).toBe(true)
  })

  it("rejects a fractional position — the backend field is an int", () => {
    expect(EventFormSchema.safeParse({ ...valid, timelineOrder: 1.5 }).success).toBe(false)
  })

  it("rejects a missing position with a readable message, not a type dump", () => {
    // An emptied number input arrives as `undefined` (EntityForm's `setValueAs`);
    // the user should be told what is wrong in words they recognise.
    const result = EventFormSchema.safeParse({ ...valid, timelineOrder: undefined })

    expect(result.success).toBe(false)
    if (!result.success) {
      const message = result.error.issues.find(
        (issue) => issue.path[0] === "timelineOrder",
      )?.message
      expect(message).toBe("Timeline position must be a whole number")
    }
  })

  it("rejects NaN rather than letting it reach the wire as null", () => {
    expect(EventFormSchema.safeParse({ ...valid, timelineOrder: Number.NaN }).success).toBe(false)
  })

  it("rejects a position beyond the safe-integer range", () => {
    expect(EventFormSchema.safeParse({ ...valid, timelineOrder: 1e21 }).success).toBe(false)
  })
})

describe("write mappers", () => {
  it("sends timeline_order in the backend's casing on create", () => {
    const body = toEventCreateBody({ name: "The Sundering", summary: "", timelineOrder: 12 })

    expect(body).toEqual({ name: "The Sundering", summary: null, timeline_order: 12 })
    expect(body).not.toHaveProperty("timelineOrder")
  })

  it("sends a zero position rather than omitting it as empty", () => {
    // `emptyToNull` must not be applied to a number: 0 is a real position.
    const body = toEventCreateBody({ name: "The Sundering", summary: "", timelineOrder: 0 })

    expect(body.timeline_order).toBe(0)
  })

  it("never echoes server-owned fields back on create", () => {
    const body = toEventCreateBody({ name: "The Sundering", summary: "", timelineOrder: 0 })

    expect(body).not.toHaveProperty("id")
    expect(body).not.toHaveProperty("created_at")
  })

  it("converts timelineOrder to timeline_order on update", () => {
    // Without the conversion the backend would not recognise the field and
    // `exclude_none` would drop it — a silent no-op update.
    expect(toEventUpdateBody({ timelineOrder: 7 })).toEqual({ timeline_order: 7 })
  })

  it("sends only the fields present in an update patch", () => {
    expect(toEventUpdateBody({ name: "The Sundering" })).toEqual({ name: "The Sundering" })
  })

  it("clears a summary with an empty string, since exclude_none drops null", () => {
    const body = toEventUpdateBody({ summary: "" })

    expect(body).toEqual({ summary: "" })
    expect(body.summary).not.toBeNull()
  })

  it("round-trips an entity through the edit form without loss", () => {
    const event = EventSchema.parse(wireEvent)

    expect(toEventForm(event)).toEqual({
      name: "The Sundering",
      summary: "The night the mountain split and the old roads drowned.",
      timelineOrder: 12,
    })
  })

  it("represents a null summary as an empty string in the form", () => {
    const event = EventSchema.parse({ ...wireEvent, summary: null })
    expect(toEventForm(event).summary).toBe("")
  })
})

describe("list params", () => {
  it("infers real param types when no categorical filter is supplied", () => {
    // A compile-time guard, not a runtime one. `listParamsSchema`'s filter
    // default previously carried a string index signature, which collapsed every
    // inferred param to `never` for any entity that passed no filters — Event is
    // the only one. The annotations below stop compiling if that regresses;
    // `tsc -b` covers test files, so this fails the build rather than the suite.
    const params = EventListParamsSchema.parse({})
    const limit: number = params.limit
    const offset: number = params.offset
    const sortBy: (typeof EVENT_SORT_FIELDS)[number] = params.sortBy
    const order: "asc" | "desc" = params.order

    expect({ limit, offset, sortBy, order }).toEqual({
      limit: 20,
      offset: 0,
      sortBy: "timeline_order",
      order: "asc",
    })
  })

  it("defaults to timeline order — the way a timeline is read", () => {
    expect(EventListParamsSchema.parse({})).toMatchObject({
      limit: 20,
      offset: 0,
      sortBy: "timeline_order",
      order: "asc",
    })
  })

  it("accepts every field the backend can actually sort by", () => {
    for (const field of ["timeline_order", "name", "created_at"]) {
      expect(EventListParamsSchema.parse({ sortBy: field }).sortBy).toBe(field)
    }
  })

  it("falls back to timeline order for a sort the backend would ignore", () => {
    // `region` is Location's, not Event's — the whitelists genuinely differ.
    expect(EventListParamsSchema.parse({ sortBy: "region" }).sortBy).toBe("timeline_order")
  })

  it("carries no categorical filter, unlike the other three entities", () => {
    const params = EventListParamsSchema.parse({ status: "alive", region: "x", ideology: "y" })

    expect(params).not.toHaveProperty("status")
    expect(params).not.toHaveProperty("region")
    expect(params).not.toHaveProperty("ideology")
  })

  it("coerces and clamps pagination values from the URL", () => {
    expect(EventListParamsSchema.parse({ limit: "50", offset: "100" })).toMatchObject({
      limit: 50,
      offset: 100,
    })
    expect(EventListParamsSchema.safeParse({ limit: "500" }).success).toBe(false)
  })
})
