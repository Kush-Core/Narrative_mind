/**
 * The Location resource against a faithful stand-in for the backend.
 *
 * This is the integration seam: real `fetch`, real URLs, real request bodies,
 * real error shapes — everything except Neo4j. It verifies that the descriptor's
 * mappers and the shared factory compose into the exact HTTP the FastAPI
 * `locations` router expects.
 */

import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { locationsApi } from "@/features/locations/api/locations.api"
import { LocationListParamsSchema } from "@/features/locations/model/location.schema"
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

const wireLocation = {
  id: "l-1",
  name: "Dunhollow",
  region: "The Ashen Reach",
  description: "A drowned mining town.",
  created_at: "2026-07-18T10:00:00+00:00",
}

const defaultParams = LocationListParamsSchema.parse({})

describe("list", () => {
  it("requests /locations with the backend's parameter names", async () => {
    let url = ""
    server.use(
      getJson("/locations", ({ request }) => {
        url = request.url
        return pageResponse([wireLocation], 1)
      }),
    )

    await locationsApi.list(
      LocationListParamsSchema.parse({
        limit: "20",
        offset: "40",
        sortBy: "region",
        order: "desc",
        nameContains: "dun",
        region: "The Ashen Reach",
      }),
    )

    const query = new URL(url).searchParams
    expect(new URL(url).pathname).toBe("/locations")
    // snake_case on the wire, camelCase in the app.
    expect(query.get("sort_by")).toBe("region")
    expect(query.get("name_contains")).toBe("dun")
    expect(query.get("order")).toBe("desc")
    expect(query.get("region")).toBe("The Ashen Reach")
    expect(query.get("limit")).toBe("20")
    expect(query.get("offset")).toBe("40")
  })

  it("returns a mapped page with client-derived hasMore", async () => {
    server.use(getJson("/locations", () => pageResponse([wireLocation], 5)))

    const page = await locationsApi.list(defaultParams)

    expect(page.total).toBe(5)
    expect(page.hasMore).toBe(true)
    expect(page.items[0]).toMatchObject({ id: "l-1", region: "The Ashen Reach" })
  })

  it("handles an empty collection", async () => {
    server.use(getJson("/locations", () => pageResponse([], 0)))

    const page = await locationsApi.list(defaultParams)

    expect(page.items).toEqual([])
    expect(page.hasMore).toBe(false)
  })

  it("omits absent filters rather than sending empty ones", async () => {
    // The backend declares both `name_contains` and `region` with
    // `min_length=1`, so an empty value would be a 422 rather than "no filter".
    let url = ""
    server.use(
      getJson("/locations", ({ request }) => {
        url = request.url
        return pageResponse([], 0)
      }),
    )

    await locationsApi.list(defaultParams)

    const query = new URL(url).searchParams
    expect(query.has("name_contains")).toBe(false)
    expect(query.has("region")).toBe(false)
  })
})

describe("get", () => {
  it("reads one location", async () => {
    server.use(getJson("/locations/l-1", () => HttpResponse.json(wireLocation)))

    await expect(locationsApi.get("l-1")).resolves.toMatchObject({ name: "Dunhollow" })
  })

  it("surfaces a missing location as a not_found ApiError", async () => {
    server.use(
      getJson("/locations/nope", () =>
        domainError(404, "not_found", "Location with id nope not found"),
      ),
    )

    const error = (await locationsApi.get("nope").catch((c: unknown) => c)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.isNotFound).toBe(true)
    expect(error.isRetryable).toBe(false)
  })
})

describe("create", () => {
  it("posts a body the backend's LocationCreate accepts", async () => {
    let received: unknown
    server.use(
      postJson("/locations", async ({ request }) => {
        received = await request.json()
        return HttpResponse.json(wireLocation, { status: 201 })
      }),
    )

    await locationsApi.create({
      name: "Dunhollow",
      region: "The Ashen Reach",
      description: "",
    })

    expect(received).toEqual({
      name: "Dunhollow",
      region: "The Ashen Reach",
      description: null,
    })
  })

  it("maps a FastAPI 422 to per-field errors for the form", async () => {
    server.use(
      postJson("/locations", () =>
        validationError([
          {
            loc: ["body", "name"],
            msg: "String should have at least 1 character",
            type: "too_short",
          },
        ]),
      ),
    )

    const error = (await locationsApi
      .create({ name: "", region: "", description: "" })
      .catch((c: unknown) => c)) as ApiError

    expect(error.code).toBe("validation")
    expect(error.fieldErrors).toEqual({ name: "String should have at least 1 character" })
  })
})

describe("update", () => {
  it("patches only the fields it is given", async () => {
    let received: unknown
    server.use(
      patchJson("/locations/l-1", async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ ...wireLocation, region: "The Verge" })
      }),
    )

    const updated = await locationsApi.update("l-1", { region: "The Verge" })

    expect(received).toEqual({ region: "The Verge" })
    expect(updated.region).toBe("The Verge")
  })

  it("refuses an empty patch, which the backend rejects with 422", () => {
    // The backend's `at_least_one_field` validator fires on `model_fields_set`.
    expect(() => locationsApi.update("l-1", {})).toThrow(/empty update/i)
  })
})

describe("delete", () => {
  it("deletes and expects no body (204)", async () => {
    server.use(deleteJson("/locations/l-1", () => new HttpResponse(null, { status: 204 })))

    await expect(locationsApi.remove("l-1")).resolves.toBeUndefined()
  })

  it("surfaces a delete of an already-missing location as not_found", async () => {
    server.use(
      deleteJson("/locations/l-1", () =>
        domainError(404, "not_found", "Location with id l-1 not present, cannot delete"),
      ),
    )

    const error = (await locationsApi.remove("l-1").catch((c: unknown) => c)) as ApiError

    expect(error.isNotFound).toBe(true)
  })
})
