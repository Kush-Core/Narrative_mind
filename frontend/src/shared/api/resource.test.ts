/**
 * The generic entity resource, and the PATCH semantics it exists to enforce
 * (docs/frontend/API_INTEGRATION_PLAN.md §3, gotchas #3 and #4).
 *
 * A stand-in entity is used deliberately: this milestone builds the machinery,
 * not the four entity modules, and the machinery must be provably correct
 * before any of them depends on it.
 */

import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createEntityResource, diffForUpdate } from "@/shared/api/resource"
import { deleteJson, getJson, pageResponse, patchJson, postJson, server } from "@/test/msw/server"

/** Shaped like a real entity: snake_case wire, camelCase domain. */
const WireSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    created_at: z.string(),
  })
  .transform((wire) => ({ id: wire.id, name: wire.name, createdAt: wire.created_at }))

interface Domain {
  id: string
  name: string
  createdAt: string
}

const resource = createEntityResource<
  Domain,
  { name: string },
  { name?: string },
  { limit: number; offset: number }
>({
  collection: "characters",
  readSchema: WireSchema,
  toCreateBody: (input) => ({ name: input.name }),
  toUpdateBody: (patch) => ({ name: patch.name }),
  toListQuery: (params) => ({ limit: params.limit, offset: params.offset }),
})

const wireEntity = { id: "c1", name: "Ada", created_at: "2026-07-18T10:00:00+00:00" }

describe("list", () => {
  it("returns a validated page with mapped fields and derived hasMore", async () => {
    server.use(getJson("/characters", () => pageResponse([wireEntity], 5)))

    const page = await resource.list({ limit: 20, offset: 0 })

    expect(page.items).toEqual([{ id: "c1", name: "Ada", createdAt: "2026-07-18T10:00:00+00:00" }])
    expect(page.total).toBe(5)
    expect(page.hasMore).toBe(true)
  })

  it("sends the collection path and the mapped query params", async () => {
    let url = ""
    server.use(
      getJson("/characters", ({ request }) => {
        url = request.url
        return pageResponse([], 0)
      }),
    )

    await resource.list({ limit: 50, offset: 100 })

    const query = new URL(url).searchParams
    expect(new URL(url).pathname).toBe("/characters")
    expect(query.get("limit")).toBe("50")
    expect(query.get("offset")).toBe("100")
  })
})

describe("get / create / remove", () => {
  it("reads one entity by id", async () => {
    server.use(getJson("/characters/c1", () => HttpResponse.json(wireEntity)))

    await expect(resource.get("c1")).resolves.toMatchObject({ id: "c1", name: "Ada" })
  })

  it("percent-encodes ids so they cannot break out of their path segment", async () => {
    let pathname = ""
    server.use(
      getJson("/characters/:id", ({ request }) => {
        pathname = new URL(request.url).pathname
        return HttpResponse.json(wireEntity)
      }),
    )

    await resource.get("a/b")

    expect(pathname).toBe("/characters/a%2Fb")
  })

  it("posts the create body and validates the created entity", async () => {
    let received: unknown
    server.use(
      postJson("/characters", async ({ request }) => {
        received = await request.json()
        return HttpResponse.json(wireEntity, { status: 201 })
      }),
    )

    await expect(resource.create({ name: "Ada" })).resolves.toMatchObject({ name: "Ada" })
    expect(received).toEqual({ name: "Ada" })
  })

  it("deletes without expecting a body", async () => {
    server.use(deleteJson("/characters/c1", () => new HttpResponse(null, { status: 204 })))

    await expect(resource.remove("c1")).resolves.toBeUndefined()
  })
})

describe("update semantics", () => {
  it("sends only the fields it is given", async () => {
    let received: unknown
    server.use(
      patchJson("/characters/c1", async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ ...wireEntity, name: "Grace" })
      }),
    )

    await resource.update("c1", { name: "Grace" })

    expect(received).toEqual({ name: "Grace" })
  })

  it("refuses to send an empty update, which the backend would reject with 422", () => {
    // No MSW handler is registered on purpose: if this ever issued a request,
    // the suite's `onUnhandledRequest: "error"` would catch it.
    expect(() => resource.update("c1", {})).toThrow(/empty update/i)
  })
})

describe("diffForUpdate", () => {
  const original = { name: "Ada", status: "alive", aliases: ["The Countess"] }

  it("returns only changed fields", () => {
    expect(diffForUpdate(original, { name: "Grace", status: "alive" })).toEqual({ name: "Grace" })
  })

  it("returns null when nothing changed, so the caller can skip the request", () => {
    expect(diffForUpdate(original, { name: "Ada", status: "alive" })).toBeNull()
  })

  it("compares array fields element-wise", () => {
    expect(diffForUpdate(original, { aliases: ["The Countess"] })).toBeNull()
    expect(diffForUpdate(original, { aliases: ["Enchantress"] })).toEqual({
      aliases: ["Enchantress"],
    })
  })

  it("ignores undefined fields rather than treating them as clears", () => {
    expect(diffForUpdate(original, { name: undefined })).toBeNull()
  })

  it("does treat an explicit null as a change, leaving the policy to the caller", () => {
    // The backend drops nulls (`exclude_none`), so the UI never offers a "clear
    // to null" affordance — but the diff itself stays honest about the input.
    expect(diffForUpdate(original, { name: null as never })).toEqual({ name: null })
  })
})
