/**
 * The shared utilities every feature will lean on. Small surfaces, but wrong
 * behaviour here would be wrong everywhere at once.
 */

import { describe, expect, it } from "vitest"

import {
  camelToSnake,
  deepKeysToCamel,
  keysToCamel,
  omitUndefined,
  snakeToCamel,
} from "@/shared/lib/casing"
import {
  getPageWindow,
  nextOffset,
  offsetAfterRemoval,
  offsetForPage,
  previousOffset,
} from "@/shared/lib/pagination"
import { buildQueryString, buildUrl, encodePathSegment } from "@/shared/lib/url"
import { listParamsSchema, listParamsToQuery } from "@/shared/schemas/list-params.schema"
import { LimitSchema } from "@/shared/schemas/primitives"

describe("query strings", () => {
  it("omits nullish and empty values", () => {
    expect(buildQueryString({ a: 1, b: null, c: undefined, d: "" })).toBe("a=1")
  })

  it("emits keys in a stable order so identical queries are byte-identical", () => {
    expect(buildQueryString({ b: 2, a: 1 })).toBe(buildQueryString({ a: 1, b: 2 }))
  })

  it("repeats array values, matching FastAPI's list handling", () => {
    expect(buildQueryString({ id: ["a", "b"] })).toBe("id=a&id=b")
  })

  it("keeps false and zero, which are meaningful values", () => {
    expect(buildQueryString({ offset: 0, flag: false })).toBe("flag=false&offset=0")
  })

  it("builds a full URL without a stray question mark", () => {
    expect(buildUrl("http://api.test", "/characters")).toBe("http://api.test/characters")
    expect(buildUrl("http://api.test", "/characters", { limit: 20 })).toBe(
      "http://api.test/characters?limit=20",
    )
  })

  it("encodes path segments so ids cannot escape their segment", () => {
    expect(encodePathSegment("a/b")).toBe("a%2Fb")
  })
})

describe("casing", () => {
  it("converts between wire and app casing", () => {
    expect(snakeToCamel("created_at")).toBe("createdAt")
    expect(snakeToCamel("timeline_order")).toBe("timelineOrder")
    expect(camelToSnake("nameContains")).toBe("name_contains")
  })

  it("leaves already-correct keys alone", () => {
    expect(snakeToCamel("name")).toBe("name")
    expect(camelToSnake("name")).toBe("name")
  })

  it("maps object keys one level deep", () => {
    expect(keysToCamel({ created_at: "x", name: "y" })).toEqual({ createdAt: "x", name: "y" })
  })

  it("maps nested structures when asked to", () => {
    expect(deepKeysToCamel({ outer_key: { inner_key: [{ leaf_key: 1 }] } })).toEqual({
      outerKey: { innerKey: [{ leafKey: 1 }] },
    })
  })

  it("drops undefined values when building bodies", () => {
    expect(omitUndefined({ a: 1, b: undefined })).toEqual({ a: 1 })
  })
})

describe("pagination", () => {
  it("describes the current window in human terms", () => {
    expect(getPageWindow({ total: 237, limit: 20, offset: 40, itemCount: 20 })).toMatchObject({
      page: 3,
      pageCount: 12,
      from: 41,
      to: 60,
      hasPrevious: true,
      hasNext: true,
    })
  })

  it("reports an empty collection as one page with no range", () => {
    expect(getPageWindow({ total: 0, limit: 20, offset: 0, itemCount: 0 })).toMatchObject({
      page: 1,
      pageCount: 1,
      from: 0,
      to: 0,
      hasPrevious: false,
      hasNext: false,
    })
  })

  it("clamps navigation at both ends", () => {
    expect(previousOffset(0, 20)).toBe(0)
    expect(nextOffset(80, 20, 100)).toBe(80)
    expect(nextOffset(40, 20, 100)).toBe(60)
    expect(offsetForPage(1, 20)).toBe(0)
    expect(offsetForPage(3, 20)).toBe(40)
  })

  it("steps back a page when the last item on it is deleted", () => {
    expect(offsetAfterRemoval(40, 20, 0)).toBe(20)
    expect(offsetAfterRemoval(40, 20, 5)).toBe(40)
    expect(offsetAfterRemoval(0, 20, 0)).toBe(0)
  })
})

describe("list params", () => {
  const CharacterListParams = listParamsSchema(["name", "created_at", "status"] as const, {})

  it("applies the backend's defaults", () => {
    expect(CharacterListParams.parse({})).toMatchObject({
      limit: 20,
      offset: 0,
      sortBy: "name",
      order: "asc",
    })
  })

  it("falls back to the default sort for a field the backend would ignore", () => {
    // The backend silently falls back to `name`; the client does so explicitly
    // rather than sending a sort that would be discarded.
    expect(CharacterListParams.parse({ sortBy: "not_a_column" }).sortBy).toBe("name")
  })

  it("accepts a valid sort field", () => {
    expect(CharacterListParams.parse({ sortBy: "created_at" }).sortBy).toBe("created_at")
  })

  it("clamps limits to the range the backend accepts", () => {
    expect(() => LimitSchema.parse(500)).toThrow()
    expect(LimitSchema.parse("50")).toBe(50)
  })

  it("translates app params to the wire's snake_case query", () => {
    const query = listParamsToQuery({
      limit: 20,
      offset: 0,
      sortBy: "created_at",
      order: "desc",
      nameContains: "ada",
      status: "alive",
    })

    expect(query).toMatchObject({
      limit: 20,
      offset: 0,
      sort_by: "created_at",
      order: "desc",
      name_contains: "ada",
      status: "alive",
    })
  })

  it("omits an absent search term rather than sending an empty one", () => {
    const query = listParamsToQuery({
      limit: 20,
      offset: 0,
      sortBy: "name",
      order: "asc",
    })

    expect(query.name_contains).toBeUndefined()
  })
})
