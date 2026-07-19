/**
 * The Faction resource against a faithful stand-in for the backend.
 *
 * This is the integration seam: real `fetch`, real URLs, real request bodies,
 * real error shapes — everything except Neo4j. It verifies that the descriptor's
 * mappers and the shared factory compose into the exact HTTP the FastAPI
 * `factions` router expects.
 */

import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { factionsApi } from "@/features/factions/api/factions.api"
import { FactionListParamsSchema } from "@/features/factions/model/faction.schema"
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

const wireFaction = {
  id: "f-1",
  name: "The Iron Pact",
  ideology: "Order through strength.",
  description: "A military compact of the northern holds.",
  created_at: "2026-07-19T10:00:00+00:00",
}

const defaultParams = FactionListParamsSchema.parse({})

describe("list", () => {
  it("requests /factions with the backend's parameter names", async () => {
    let url = ""
    server.use(
      getJson("/factions", ({ request }) => {
        url = request.url
        return pageResponse([wireFaction], 1)
      }),
    )

    await factionsApi.list(
      FactionListParamsSchema.parse({
        limit: "20",
        offset: "40",
        sortBy: "ideology",
        order: "desc",
        nameContains: "iron",
        ideology: "Order through strength.",
      }),
    )

    const query = new URL(url).searchParams
    expect(new URL(url).pathname).toBe("/factions")
    // snake_case on the wire, camelCase in the app.
    expect(query.get("sort_by")).toBe("ideology")
    expect(query.get("name_contains")).toBe("iron")
    expect(query.get("order")).toBe("desc")
    expect(query.get("ideology")).toBe("Order through strength.")
    expect(query.get("limit")).toBe("20")
    expect(query.get("offset")).toBe("40")
  })

  it("returns a mapped page with client-derived hasMore", async () => {
    server.use(getJson("/factions", () => pageResponse([wireFaction], 5)))

    const page = await factionsApi.list(defaultParams)

    expect(page.total).toBe(5)
    expect(page.hasMore).toBe(true)
    expect(page.items[0]).toMatchObject({ id: "f-1", ideology: "Order through strength." })
  })

  it("handles an empty collection", async () => {
    server.use(getJson("/factions", () => pageResponse([], 0)))

    const page = await factionsApi.list(defaultParams)

    expect(page.items).toEqual([])
    expect(page.hasMore).toBe(false)
  })

  it("omits absent filters rather than sending empty ones", async () => {
    // The backend declares both `name_contains` and `ideology` with
    // `min_length=1`, so an empty value would be a 422 rather than "no filter".
    let url = ""
    server.use(
      getJson("/factions", ({ request }) => {
        url = request.url
        return pageResponse([], 0)
      }),
    )

    await factionsApi.list(defaultParams)

    const query = new URL(url).searchParams
    expect(query.has("name_contains")).toBe(false)
    expect(query.has("ideology")).toBe(false)
  })
})

describe("get", () => {
  it("reads one faction", async () => {
    server.use(getJson("/factions/f-1", () => HttpResponse.json(wireFaction)))

    await expect(factionsApi.get("f-1")).resolves.toMatchObject({ name: "The Iron Pact" })
  })

  it("surfaces a missing faction as a not_found ApiError", async () => {
    server.use(
      getJson("/factions/nope", () =>
        domainError(404, "not_found", "Faction with id nope not found"),
      ),
    )

    const error = (await factionsApi.get("nope").catch((c: unknown) => c)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.isNotFound).toBe(true)
    expect(error.isRetryable).toBe(false)
  })
})

describe("create", () => {
  it("posts a body the backend's FactionCreate accepts", async () => {
    let received: unknown
    server.use(
      postJson("/factions", async ({ request }) => {
        received = await request.json()
        return HttpResponse.json(wireFaction, { status: 201 })
      }),
    )

    await factionsApi.create({
      name: "The Iron Pact",
      ideology: "Order through strength.",
      description: "",
    })

    expect(received).toEqual({
      name: "The Iron Pact",
      ideology: "Order through strength.",
      description: null,
    })
  })

  it("maps a FastAPI 422 to per-field errors for the form", async () => {
    server.use(
      postJson("/factions", () =>
        validationError([
          {
            loc: ["body", "ideology"],
            msg: "String should have at most 500 characters",
            type: "too_long",
          },
        ]),
      ),
    )

    const error = (await factionsApi
      .create({ name: "The Iron Pact", ideology: "a".repeat(501), description: "" })
      .catch((c: unknown) => c)) as ApiError

    expect(error.code).toBe("validation")
    expect(error.fieldErrors).toEqual({ ideology: "String should have at most 500 characters" })
  })
})

describe("update", () => {
  it("patches only the fields it is given", async () => {
    let received: unknown
    server.use(
      patchJson("/factions/f-1", async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ ...wireFaction, ideology: "Peace through trade." })
      }),
    )

    const updated = await factionsApi.update("f-1", { ideology: "Peace through trade." })

    expect(received).toEqual({ ideology: "Peace through trade." })
    expect(updated.ideology).toBe("Peace through trade.")
  })

  it("refuses an empty patch, which the backend rejects with 422", () => {
    // The backend's `at_least_one_field` validator fires on `model_fields_set`.
    expect(() => factionsApi.update("f-1", {})).toThrow(/empty update/i)
  })
})

describe("delete", () => {
  it("deletes and expects no body (204)", async () => {
    server.use(deleteJson("/factions/f-1", () => new HttpResponse(null, { status: 204 })))

    await expect(factionsApi.remove("f-1")).resolves.toBeUndefined()
  })

  it("surfaces a delete of an already-missing faction as not_found", async () => {
    server.use(
      deleteJson("/factions/f-1", () =>
        domainError(404, "not_found", "Faction with id f-1 not present, cannot delete"),
      ),
    )

    const error = (await factionsApi.remove("f-1").catch((c: unknown) => c)) as ApiError

    expect(error.isNotFound).toBe(true)
  })
})
