/**
 * The Event resource against a faithful stand-in for the backend.
 *
 * This is the integration seam: real `fetch`, real URLs, real request bodies,
 * real error shapes — everything except Neo4j. It verifies that the descriptor's
 * mappers and the shared factory compose into the exact HTTP the FastAPI
 * `events` router expects.
 */

import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { eventsApi } from "@/features/events/api/events.api"
import { EventListParamsSchema } from "@/features/events/model/event.schema"
import { ApiError } from "@/shared/api/api-error"
import {
  deleteJson,
  domainError,
  getJson,
  pageResponse,
  patchJson,
  postJson,
  server,
  validationError,
} from "@/test/msw/server"

const wireEvent = {
  id: "e-1",
  name: "The Sundering",
  summary: "The night the mountain split.",
  timeline_order: 12,
  created_at: "2026-07-19T10:00:00+00:00",
}

const defaultParams = EventListParamsSchema.parse({})

describe("list", () => {
  it("requests /events with the backend's parameter names", async () => {
    let url = ""
    server.use(
      getJson("/events", ({ request }) => {
        url = request.url
        return pageResponse([wireEvent], 1)
      }),
    )

    await eventsApi.list(
      EventListParamsSchema.parse({
        limit: "20",
        offset: "40",
        sortBy: "timeline_order",
        order: "desc",
        nameContains: "sunder",
      }),
    )

    const query = new URL(url).searchParams
    expect(new URL(url).pathname).toBe("/events")
    expect(query.get("sort_by")).toBe("timeline_order")
    expect(query.get("name_contains")).toBe("sunder")
    expect(query.get("order")).toBe("desc")
    expect(query.get("limit")).toBe("20")
    expect(query.get("offset")).toBe("40")
  })

  it("sends no categorical filter, because the endpoint accepts none", async () => {
    let url = ""
    server.use(
      getJson("/events", ({ request }) => {
        url = request.url
        return pageResponse([], 0)
      }),
    )

    await eventsApi.list(defaultParams)

    const query = new URL(url).searchParams
    expect(query.has("status")).toBe(false)
    expect(query.has("region")).toBe(false)
    expect(query.has("ideology")).toBe(false)
    expect(query.has("name_contains")).toBe(false)
  })

  it("returns a mapped page with client-derived hasMore", async () => {
    server.use(getJson("/events", () => pageResponse([wireEvent], 5)))

    const page = await eventsApi.list(defaultParams)

    expect(page.total).toBe(5)
    expect(page.hasMore).toBe(true)
    expect(page.items[0]).toMatchObject({ id: "e-1", timelineOrder: 12 })
  })

  it("handles an empty collection", async () => {
    server.use(getJson("/events", () => pageResponse([], 0)))

    const page = await eventsApi.list(defaultParams)

    expect(page.items).toEqual([])
    expect(page.hasMore).toBe(false)
  })
})

describe("get", () => {
  it("reads one event", async () => {
    server.use(getJson("/events/e-1", () => HttpResponse.json(wireEvent)))

    await expect(eventsApi.get("e-1")).resolves.toMatchObject({
      name: "The Sundering",
      timelineOrder: 12,
    })
  })

  it("surfaces a missing event as a not_found ApiError", async () => {
    server.use(
      getJson("/events/nope", () => domainError(404, "not_found", "Event with id nope not found")),
    )

    const error = (await eventsApi.get("nope").catch((c: unknown) => c)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.isNotFound).toBe(true)
    expect(error.isRetryable).toBe(false)
  })
})

describe("create", () => {
  it("posts a body the backend's EventCreate accepts, in wire casing", async () => {
    let received: unknown
    server.use(
      postJson("/events", async ({ request }) => {
        received = await request.json()
        return HttpResponse.json(wireEvent, { status: 201 })
      }),
    )

    await eventsApi.create({ name: "The Sundering", summary: "", timelineOrder: 12 })

    expect(received).toEqual({
      name: "The Sundering",
      summary: null,
      timeline_order: 12,
    })
  })

  it("maps a FastAPI 422 to per-field errors for the form", async () => {
    server.use(
      postJson("/events", () =>
        validationError([
          {
            loc: ["body", "timeline_order"],
            msg: "Input should be a valid integer",
            type: "int_parsing",
          },
        ]),
      ),
    )

    const error = (await eventsApi
      .create({ name: "The Sundering", summary: "", timelineOrder: 0 })
      .catch((c: unknown) => c)) as ApiError

    expect(error.code).toBe("validation")
    expect(error.fieldErrors).toEqual({ timeline_order: "Input should be a valid integer" })
  })
})

describe("update", () => {
  it("patches timeline_order in the backend's casing", async () => {
    let received: unknown
    server.use(
      patchJson("/events/e-1", async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ ...wireEvent, timeline_order: 7 })
      }),
    )

    const updated = await eventsApi.update("e-1", { timelineOrder: 7 })

    expect(received).toEqual({ timeline_order: 7 })
    expect(updated.timelineOrder).toBe(7)
  })

  it("sends a zero position rather than dropping it as falsy", async () => {
    let received: unknown
    server.use(
      patchJson("/events/e-1", async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ ...wireEvent, timeline_order: 0 })
      }),
    )

    await eventsApi.update("e-1", { timelineOrder: 0 })

    expect(received).toEqual({ timeline_order: 0 })
  })

  it("refuses an empty patch, which the backend rejects with 422", () => {
    expect(() => eventsApi.update("e-1", {})).toThrow(/empty update/i)
  })
})

describe("delete", () => {
  it("deletes and expects no body (204)", async () => {
    server.use(deleteJson("/events/e-1", () => new HttpResponse(null, { status: 204 })))

    await expect(eventsApi.remove("e-1")).resolves.toBeUndefined()
  })

  it("surfaces a delete of an already-missing event as not_found", async () => {
    server.use(
      deleteJson("/events/e-1", () =>
        domainError(404, "not_found", "Event with id e-1 not present, cannot delete"),
      ),
    )

    const error = (await eventsApi.remove("e-1").catch((c: unknown) => c)) as ApiError

    expect(error.isNotFound).toBe(true)
  })
})
