/**
 * The collection-agnostic lookup behind `EntityPicker`.
 *
 * The property that matters is that one function serves all four collections
 * with the same query contract — that is the claim that lets the picker avoid
 * importing any feature slice.
 */

import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import type { EntityCollection } from "@/shared/api/endpoints"
import { ENTITY_LOOKUP_LIMIT, lookupEntities, lookupEntity } from "@/shared/api/entity-lookup"
import { getJson, pageResponse, server } from "@/test/msw/server"

const COLLECTIONS: EntityCollection[] = ["characters", "locations", "factions", "events"]

describe("lookupEntities", () => {
  it("lists any collection through the same contract", async () => {
    for (const collection of COLLECTIONS) {
      server.use(
        getJson(`/${collection}`, () => pageResponse([{ id: "x-1", name: "Something" }], 1)),
      )

      await expect(lookupEntities(collection)).resolves.toEqual([{ id: "x-1", name: "Something" }])
    }
  })

  it("sorts by name so a writer can scan for one they already have in mind", async () => {
    let url = ""
    server.use(
      getJson("/characters", ({ request }) => {
        url = request.url
        return pageResponse([], 0)
      }),
    )

    await lookupEntities("characters")

    const params = new URL(url).searchParams
    expect(params.get("sort_by")).toBe("name")
    expect(params.get("order")).toBe("asc")
    expect(params.get("limit")).toBe(String(ENTITY_LOOKUP_LIMIT))
  })

  it("passes a search term as name_contains", async () => {
    let url = ""
    server.use(
      getJson("/factions", ({ request }) => {
        url = request.url
        return pageResponse([], 0)
      }),
    )

    await lookupEntities("factions", { search: "  salt  " })

    expect(new URL(url).searchParams.get("name_contains")).toBe("salt")
  })

  it("omits name_contains entirely when the search is blank", async () => {
    let url = ""
    server.use(
      getJson("/factions", ({ request }) => {
        url = request.url
        return pageResponse([], 0)
      }),
    )

    await lookupEntities("factions", { search: "   " })

    // An empty `name_contains` would be an exact filter on nothing rather than
    // "no filter".
    expect(new URL(url).searchParams.has("name_contains")).toBe(false)
  })

  it("ignores fields the picker does not need", async () => {
    // The entity schemas validate the full record; this one deliberately does
    // not, so a new backend field cannot break a picker that never reads it.
    server.use(
      getJson("/events", () =>
        pageResponse([{ id: "e-1", name: "The Drowning", timeline_order: 1, summary: "…" }], 1),
      ),
    )

    await expect(lookupEntities("events")).resolves.toEqual([{ id: "e-1", name: "The Drowning" }])
  })
})

describe("lookupEntity", () => {
  it("resolves one entity to an option", async () => {
    server.use(getJson("/locations/l-1", () => HttpResponse.json({ id: "l-1", name: "Greyfen" })))

    await expect(lookupEntity("locations", "l-1")).resolves.toEqual({ id: "l-1", name: "Greyfen" })
  })

  it("returns null for an id that no longer exists", async () => {
    // A picker holding a stale id should show an unresolved value, not take out
    // the screen it sits on.
    server.use(getJson("/locations/gone", () => HttpResponse.json(null, { status: 404 })))

    await expect(lookupEntity("locations", "gone")).resolves.toBeNull()
  })
})
