/**
 * The Character resource against a faithful stand-in for the backend.
 *
 * This is the integration seam: real `fetch`, real URLs, real request bodies,
 * real error shapes — everything except Neo4j. It verifies that the descriptor's
 * mappers and the shared factory compose into the exact HTTP the FastAPI
 * routers expect.
 */

import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { charactersApi } from "@/features/characters/api/characters.api"
import { CharacterListParamsSchema } from "@/features/characters/model/character.schema"
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

const wireCharacter = {
  id: "c-1",
  name: "Aria Vane",
  aliases: ["The Ashen"],
  status: "alive",
  description: "A cartographer of dead cities.",
  created_at: "2026-07-18T10:00:00+00:00",
  display_name: "Aria Vane (The Ashen)",
}

const defaultParams = CharacterListParamsSchema.parse({})

describe("list", () => {
  it("requests /characters with the backend's parameter names", async () => {
    let url = ""
    server.use(
      getJson("/characters", ({ request }) => {
        url = request.url
        return pageResponse([wireCharacter], 1)
      }),
    )

    await charactersApi.list(
      CharacterListParamsSchema.parse({
        limit: "20",
        offset: "40",
        sortBy: "created_at",
        order: "desc",
        nameContains: "aria",
        status: "alive",
      }),
    )

    const query = new URL(url).searchParams
    expect(new URL(url).pathname).toBe("/characters")
    // snake_case on the wire, camelCase in the app.
    expect(query.get("sort_by")).toBe("created_at")
    expect(query.get("name_contains")).toBe("aria")
    expect(query.get("order")).toBe("desc")
    expect(query.get("status")).toBe("alive")
    expect(query.get("limit")).toBe("20")
    expect(query.get("offset")).toBe("40")
  })

  it("returns a mapped page with client-derived hasMore", async () => {
    server.use(getJson("/characters", () => pageResponse([wireCharacter], 5)))

    const page = await charactersApi.list(defaultParams)

    expect(page.total).toBe(5)
    expect(page.hasMore).toBe(true)
    expect(page.items[0]).toMatchObject({ id: "c-1", displayName: "Aria Vane (The Ashen)" })
  })

  it("handles an empty collection", async () => {
    server.use(getJson("/characters", () => pageResponse([], 0)))

    const page = await charactersApi.list(defaultParams)

    expect(page.items).toEqual([])
    expect(page.hasMore).toBe(false)
  })

  it("omits an absent search term rather than sending an empty one", async () => {
    // The backend declares `name_contains` with `min_length=1`, so an empty
    // value would be a 422 rather than "no filter".
    let url = ""
    server.use(
      getJson("/characters", ({ request }) => {
        url = request.url
        return pageResponse([], 0)
      }),
    )

    await charactersApi.list(defaultParams)

    expect(new URL(url).searchParams.has("name_contains")).toBe(false)
  })
})

describe("get", () => {
  it("reads one character", async () => {
    server.use(getJson("/characters/c-1", () => HttpResponse.json(wireCharacter)))

    await expect(charactersApi.get("c-1")).resolves.toMatchObject({ name: "Aria Vane" })
  })

  it("surfaces a missing character as a not_found ApiError", async () => {
    server.use(
      getJson("/characters/nope", () =>
        domainError(404, "not_found", "Character with id nope not found"),
      ),
    )

    const error = (await charactersApi.get("nope").catch((c: unknown) => c)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.isNotFound).toBe(true)
    expect(error.isRetryable).toBe(false)
  })
})

describe("create", () => {
  it("posts a body the backend's CharacterCreate accepts", async () => {
    let received: unknown
    server.use(
      postJson("/characters", async ({ request }) => {
        received = await request.json()
        return HttpResponse.json(wireCharacter, { status: 201 })
      }),
    )

    await charactersApi.create({
      name: "Aria Vane",
      aliases: ["The Ashen"],
      status: "alive",
      description: "",
    })

    expect(received).toEqual({
      name: "Aria Vane",
      aliases: ["The Ashen"],
      status: "alive",
      description: null,
    })
  })

  it("maps a FastAPI 422 to per-field errors for the form", async () => {
    server.use(
      postJson("/characters", () =>
        validationError([
          {
            loc: ["body", "name"],
            msg: "String should have at least 1 character",
            type: "too_short",
          },
        ]),
      ),
    )

    const error = (await charactersApi
      .create({ name: "", aliases: [], status: "alive", description: "" })
      .catch((c: unknown) => c)) as ApiError

    expect(error.code).toBe("validation")
    expect(error.fieldErrors).toEqual({ name: "String should have at least 1 character" })
  })
})

describe("update", () => {
  it("patches only the fields it is given", async () => {
    let received: unknown
    server.use(
      patchJson("/characters/c-1", async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ ...wireCharacter, status: "dead" })
      }),
    )

    const updated = await charactersApi.update("c-1", { status: "dead" })

    expect(received).toEqual({ status: "dead" })
    expect(updated.status).toBe("dead")
  })

  it("refuses an empty patch, which the backend rejects with 422", () => {
    // The backend's `at_least_one_field` validator fires on `model_fields_set`.
    expect(() => charactersApi.update("c-1", {})).toThrow(/empty update/i)
  })
})

describe("delete", () => {
  it("deletes and expects no body (204)", async () => {
    server.use(deleteJson("/characters/c-1", () => new HttpResponse(null, { status: 204 })))

    await expect(charactersApi.remove("c-1")).resolves.toBeUndefined()
  })

  it("surfaces a delete of an already-missing character as not_found", async () => {
    server.use(
      deleteJson("/characters/c-1", () =>
        domainError(404, "not_found", "Character with id c-1 not present, cannot delete"),
      ),
    )

    const error = (await charactersApi.remove("c-1").catch((c: unknown) => c)) as ApiError

    expect(error.isNotFound).toBe(true)
  })
})
