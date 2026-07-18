/**
 * The HTTP client, exercised over a real `fetch` against MSW.
 *
 * These are the tests that prove the spine works end to end: URL building,
 * header management, body handling, schema validation, cancellation, and the
 * translation of every failure mode into an `ApiError`.
 */

import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { ApiError } from "@/shared/api/api-error"
import { HttpClient } from "@/shared/api/http-client"
import {
  deleteJson,
  domainError,
  getJson,
  patchJson,
  postJson,
  server,
  validationError,
} from "@/test/msw/server"

const client = new HttpClient()

const ThingSchema = z.object({ id: z.string(), name: z.string() })

describe("requests", () => {
  it("builds the URL from the configured base and path", async () => {
    server.use(getJson("/things", () => HttpResponse.json({ id: "1", name: "Ada" })))

    await expect(client.get("/things", { schema: ThingSchema })).resolves.toEqual({
      id: "1",
      name: "Ada",
    })
  })

  it("omits null, undefined, and empty query params", async () => {
    let requestUrl = ""
    server.use(
      getJson("/things", ({ request }) => {
        requestUrl = request.url
        return HttpResponse.json({ id: "1", name: "Ada" })
      }),
    )

    await client.get("/things", {
      query: { limit: 20, offset: 0, name_contains: undefined, status: null, region: "" },
    })

    const query = new URL(requestUrl).searchParams
    expect(query.get("limit")).toBe("20")
    expect(query.get("offset")).toBe("0")
    expect(query.has("name_contains")).toBe(false)
    expect(query.has("status")).toBe(false)
    expect(query.has("region")).toBe(false)
  })

  it("sends JSON headers and a serialized body on writes", async () => {
    let contentType: string | null = null
    let received: unknown

    server.use(
      postJson("/things", async ({ request }) => {
        contentType = request.headers.get("content-type")
        received = await request.json()
        return HttpResponse.json({ id: "1", name: "Ada" }, { status: 201 })
      }),
    )

    await client.post("/things", { name: "Ada" }, { schema: ThingSchema })

    expect(contentType).toContain("application/json")
    expect(received).toEqual({ name: "Ada" })
  })

  it("sends no content-type when there is no body", async () => {
    let contentType: string | null = "unset"
    server.use(
      getJson("/things", ({ request }) => {
        contentType = request.headers.get("content-type")
        return HttpResponse.json({ id: "1", name: "Ada" })
      }),
    )

    await client.get("/things")

    expect(contentType).toBeNull()
  })

  it("merges caller-supplied headers", async () => {
    let custom: string | null = null
    server.use(
      getJson("/things", ({ request }) => {
        custom = request.headers.get("x-trace")
        return HttpResponse.json({ id: "1", name: "Ada" })
      }),
    )

    await client.get("/things", { headers: { "x-trace": "abc123" } })

    expect(custom).toBe("abc123")
  })

  it("treats a 204 as an empty response rather than a parse failure", async () => {
    server.use(deleteJson("/things/1", () => new HttpResponse(null, { status: 204 })))

    await expect(client.delete("/things/1")).resolves.toBeUndefined()
  })

  it("supports PATCH for partial updates", async () => {
    let received: unknown
    server.use(
      patchJson("/things/1", async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ id: "1", name: "Grace" })
      }),
    )

    await client.patch("/things/1", { name: "Grace" }, { schema: ThingSchema })

    expect(received).toEqual({ name: "Grace" })
  })
})

describe("failures", () => {
  it("throws a normalized ApiError for a domain envelope", async () => {
    server.use(getJson("/things/9", () => domainError(404, "not_found", "Thing not found")))

    const error = await client.get("/things/9").catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe("not_found")
    expect((error as ApiError).message).toBe("Thing not found")
  })

  it("throws a normalized ApiError with field errors for a FastAPI 422", async () => {
    server.use(
      postJson("/things", () =>
        validationError([{ loc: ["body", "name"], msg: "Field required", type: "missing" }]),
      ),
    )

    const error = await client.post("/things", {}).catch((caught: unknown) => caught)

    expect((error as ApiError).code).toBe("validation")
    expect((error as ApiError).fieldErrors).toEqual({ name: "Field required" })
  })

  it("reports a schema mismatch as a parse error, not a raw Zod error", async () => {
    server.use(getJson("/things", () => HttpResponse.json({ id: 1, name: null })))

    const error = await client.get("/things", { schema: ThingSchema }).catch((c: unknown) => c)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe("parse")
  })

  it("records the failing request for diagnostics", async () => {
    server.use(getJson("/things/9", () => domainError(404, "not_found", "Nope")))

    const error = (await client.get("/things/9").catch((c: unknown) => c)) as ApiError

    expect(error.request?.method).toBe("GET")
    expect(error.request?.url).toContain("/things/9")
  })
})

describe("cancellation and deadlines", () => {
  it("normalizes a caller abort to a canceled error", async () => {
    server.use(getJson("/things", () => HttpResponse.json({ id: "1", name: "Ada" })))

    const controller = new AbortController()
    const pending = client.get("/things", { signal: controller.signal })
    controller.abort()

    const error = (await pending.catch((c: unknown) => c)) as ApiError
    expect(error.code).toBe("canceled")
  })

  it("surfaces a hung backend as a timeout rather than hanging forever", async () => {
    server.use(
      getJson("/slow", async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return HttpResponse.json({ id: "1", name: "Ada" })
      }),
    )

    const impatient = new HttpClient({ defaultTimeoutMs: 20 })
    const error = (await impatient.get("/slow").catch((c: unknown) => c)) as ApiError

    expect(error.code).toBe("timeout")
  })
})

describe("auth seam", () => {
  it("sends no authorization header with the default no-op provider", async () => {
    let auth: string | null = "unset"
    server.use(
      getJson("/things", ({ request }) => {
        auth = request.headers.get("authorization")
        return HttpResponse.json({ id: "1", name: "Ada" })
      }),
    )

    await client.get("/things")

    expect(auth).toBeNull()
  })

  it("attaches a bearer token when a provider supplies one", async () => {
    let auth: string | null = null
    server.use(
      getJson("/things", ({ request }) => {
        auth = request.headers.get("authorization")
        return HttpResponse.json({ id: "1", name: "Ada" })
      }),
    )

    const authed = new HttpClient({ auth: { getToken: () => "token-123" } })
    await authed.get("/things")

    expect(auth).toBe("Bearer token-123")
  })
})
