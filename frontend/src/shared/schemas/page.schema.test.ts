/**
 * The `hasMore` derivation (docs/frontend/API_INTEGRATION_PLAN.md §3, gotcha #1).
 *
 * `Page.has_more` is a plain Python `@property`, not a Pydantic field, so it is
 * never serialized (backend/src/narrative_mind/domain/common.py). Every page in
 * the app depends on this being reconstructed correctly client-side.
 */

import { describe, expect, it } from "vitest"
import { z } from "zod"

import { deriveHasMore, emptyPage, pageSchema } from "@/shared/schemas/page.schema"

const ItemSchema = z.object({ id: z.string(), name: z.string() })
const ItemPageSchema = pageSchema(ItemSchema)

function wirePage(items: { id: string; name: string }[], total: number, offset = 0, limit = 20) {
  // Note the absence of `has_more` — this is exactly what the backend sends.
  return { items, total, limit, offset }
}

describe("hasMore derivation", () => {
  it("is true when items remain beyond the current page", () => {
    const page = ItemPageSchema.parse(wirePage([{ id: "1", name: "A" }], 10))

    expect(page.hasMore).toBe(true)
    expect(page.items).toHaveLength(1)
  })

  it("is false on the final page", () => {
    const page = ItemPageSchema.parse(wirePage([{ id: "3", name: "C" }], 3, 2))

    expect(page.hasMore).toBe(false)
  })

  it("is false for an empty collection", () => {
    const page = ItemPageSchema.parse(wirePage([], 0))

    expect(page.hasMore).toBe(false)
  })

  it("is false when the page exactly fills the total", () => {
    const page = ItemPageSchema.parse(
      wirePage(
        [
          { id: "1", name: "A" },
          { id: "2", name: "B" },
        ],
        2,
      ),
    )

    expect(page.hasMore).toBe(false)
  })

  it("matches the backend's own has_more definition across offsets", () => {
    // offset + len(items) < total
    expect(deriveHasMore(0, 20, 100)).toBe(true)
    expect(deriveHasMore(80, 20, 100)).toBe(false)
    expect(deriveHasMore(80, 19, 100)).toBe(true)
  })

  it("derives hasMore from the numbers, never from a has_more in the payload", () => {
    // A payload claiming the opposite of what the numbers say. If the schema
    // ever started trusting the field, these would flip.
    const lyingTrue = ItemPageSchema.parse({ ...wirePage([], 0), has_more: true })
    expect(lyingTrue.hasMore).toBe(false)

    const lyingFalse = ItemPageSchema.parse({
      ...wirePage([{ id: "1", name: "A" }], 10),
      has_more: false,
    })
    expect(lyingFalse.hasMore).toBe(true)
  })
})

describe("page validation", () => {
  it("rejects a payload whose items do not match the item schema", () => {
    expect(() => ItemPageSchema.parse(wirePage([{ id: "1" } as never], 1))).toThrow()
  })

  it("applies the backend's pagination defaults", () => {
    const page = ItemPageSchema.parse({ items: [], total: 0 })

    expect(page.limit).toBe(20)
    expect(page.offset).toBe(0)
  })
})

describe("emptyPage", () => {
  it("produces a well-formed placeholder", () => {
    expect(emptyPage<string>(20)).toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    })
  })
})
