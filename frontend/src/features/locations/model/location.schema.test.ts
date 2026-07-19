/**
 * The Location contract, pinned against the real backend model
 * (`backend/src/narrative_mind/domain/location.py`).
 *
 * These tests are the guard on the anti-corruption boundary: if the backend's
 * shape or semantics change, they fail here rather than three screens away.
 */

import { describe, expect, it } from "vitest"

import {
  LocationFormSchema,
  LocationListParamsSchema,
  LocationSchema,
  toLocationCreateBody,
  toLocationForm,
  toLocationUpdateBody,
} from "@/features/locations/model/location.schema"

const wireLocation = {
  id: "l-1",
  name: "Dunhollow",
  region: "The Ashen Reach",
  description: "A drowned mining town.",
  created_at: "2026-07-18T10:00:00+00:00",
}

describe("read model", () => {
  it("maps the wire shape to camelCase domain fields", () => {
    expect(LocationSchema.parse(wireLocation)).toEqual({
      id: "l-1",
      name: "Dunhollow",
      region: "The Ashen Reach",
      description: "A drowned mining town.",
      createdAt: "2026-07-18T10:00:00+00:00",
    })
  })

  it("normalizes null optional fields to null rather than undefined", () => {
    const location = LocationSchema.parse({ ...wireLocation, region: null, description: null })

    expect(location.region).toBeNull()
    expect(location.description).toBeNull()
  })

  it("tolerates optional fields being absent entirely", () => {
    const { region: _r, description: _d, ...bare } = wireLocation

    expect(LocationSchema.parse(bare)).toMatchObject({ region: null, description: null })
  })
})

describe("form validation", () => {
  const valid = { name: "Dunhollow", region: "", description: "" }

  it("accepts a minimal valid location — only the name is required", () => {
    expect(LocationFormSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects a blank name, matching the backend's name_not_blank validator", () => {
    expect(LocationFormSchema.safeParse({ ...valid, name: "   " }).success).toBe(false)
  })

  it("enforces the backend's 120-character name bound", () => {
    expect(LocationFormSchema.safeParse({ ...valid, name: "a".repeat(121) }).success).toBe(false)
    expect(LocationFormSchema.safeParse({ ...valid, name: "a".repeat(120) }).success).toBe(true)
  })

  it("enforces the 120-character region bound, which differs from description's", () => {
    expect(LocationFormSchema.safeParse({ ...valid, region: "a".repeat(121) }).success).toBe(false)
    expect(LocationFormSchema.safeParse({ ...valid, region: "a".repeat(120) }).success).toBe(true)
  })

  it("enforces the 2000-character description bound", () => {
    expect(LocationFormSchema.safeParse({ ...valid, description: "a".repeat(2001) }).success).toBe(
      false,
    )
  })

  it("trims surrounding whitespace, as the backend's str_strip_whitespace does", () => {
    const parsed = LocationFormSchema.parse({
      name: "  Dunhollow  ",
      region: "  Reach  ",
      description: "",
    })

    expect(parsed.name).toBe("Dunhollow")
    expect(parsed.region).toBe("Reach")
  })
})

describe("write mappers", () => {
  it("never echoes server-owned fields back on create", () => {
    const body = toLocationCreateBody({ name: "Dunhollow", region: "Reach", description: "" })

    expect(body).not.toHaveProperty("id")
    expect(body).not.toHaveProperty("created_at")
  })

  it("sends empty optional fields as null on create, matching `str | None`", () => {
    const body = toLocationCreateBody({ name: "Dunhollow", region: "   ", description: "" })

    expect(body).toEqual({ name: "Dunhollow", region: null, description: null })
  })

  it("sends only the fields present in an update patch", () => {
    expect(toLocationUpdateBody({ name: "Dunhollow" })).toEqual({ name: "Dunhollow" })
    expect(toLocationUpdateBody({ region: "Reach" })).toEqual({ region: "Reach" })
  })

  it("clears a region with an empty string, since exclude_none drops null", () => {
    // The backend's PATCH dump uses `exclude_none=True`, so `null` would be
    // silently discarded and the old region would survive.
    const body = toLocationUpdateBody({ region: "", description: "" })

    expect(body).toEqual({ region: "", description: "" })
    expect(body.region).not.toBeNull()
  })

  it("round-trips an entity through the edit form without loss", () => {
    const location = LocationSchema.parse(wireLocation)

    expect(toLocationForm(location)).toEqual({
      name: "Dunhollow",
      region: "The Ashen Reach",
      description: "A drowned mining town.",
    })
  })

  it("represents null optional fields as empty strings in the form", () => {
    const location = LocationSchema.parse({ ...wireLocation, region: null, description: null })
    const form = toLocationForm(location)

    expect(form.region).toBe("")
    expect(form.description).toBe("")
  })
})

describe("list params", () => {
  it("applies the backend's defaults", () => {
    expect(LocationListParamsSchema.parse({})).toMatchObject({
      limit: 20,
      offset: 0,
      sortBy: "name",
      order: "asc",
    })
  })

  it("accepts every field the backend can actually sort by", () => {
    for (const field of ["name", "created_at", "region"]) {
      expect(LocationListParamsSchema.parse({ sortBy: field }).sortBy).toBe(field)
    }
  })

  it("falls back to name for a sort the backend would silently ignore", () => {
    // `status` is Character's, not Location's — the whitelists genuinely differ.
    expect(LocationListParamsSchema.parse({ sortBy: "status" }).sortBy).toBe("name")
  })

  it("keeps a region filter as free text rather than validating it against a set", () => {
    expect(LocationListParamsSchema.parse({ region: "The Ashen Reach" }).region).toBe(
      "The Ashen Reach",
    )
  })

  it("drops a blank region filter, which the backend would reject as min_length=1", () => {
    expect(LocationListParamsSchema.parse({ region: "   " }).region).toBeUndefined()
  })

  it("coerces and clamps pagination values from the URL", () => {
    expect(LocationListParamsSchema.parse({ limit: "50", offset: "100" })).toMatchObject({
      limit: 50,
      offset: 100,
    })
    expect(LocationListParamsSchema.safeParse({ limit: "500" }).success).toBe(false)
  })
})
