/**
 * The Faction contract, pinned against the real backend model
 * (`backend/src/narrative_mind/domain/faction.py`).
 *
 * These tests are the guard on the anti-corruption boundary: if the backend's
 * shape or semantics change, they fail here rather than three screens away.
 */

import { describe, expect, it } from "vitest"

import {
  FactionFormSchema,
  FactionListParamsSchema,
  FactionSchema,
  toFactionCreateBody,
  toFactionForm,
  toFactionUpdateBody,
} from "@/features/factions/model/faction.schema"

const wireFaction = {
  id: "f-1",
  name: "The Iron Pact",
  ideology: "Order through strength; the weak are a debt the strong repay.",
  description: "A military compact of the northern holds.",
  created_at: "2026-07-19T10:00:00+00:00",
}

describe("read model", () => {
  it("maps the wire shape to camelCase domain fields", () => {
    expect(FactionSchema.parse(wireFaction)).toEqual({
      id: "f-1",
      name: "The Iron Pact",
      ideology: "Order through strength; the weak are a debt the strong repay.",
      description: "A military compact of the northern holds.",
      createdAt: "2026-07-19T10:00:00+00:00",
    })
  })

  it("normalizes null optional fields to null rather than undefined", () => {
    const faction = FactionSchema.parse({ ...wireFaction, ideology: null, description: null })

    expect(faction.ideology).toBeNull()
    expect(faction.description).toBeNull()
  })

  it("tolerates optional fields being absent entirely", () => {
    const { ideology: _i, description: _d, ...bare } = wireFaction

    expect(FactionSchema.parse(bare)).toMatchObject({ ideology: null, description: null })
  })
})

describe("form validation", () => {
  const valid = { name: "The Iron Pact", ideology: "", description: "" }

  it("accepts a minimal valid faction — only the name is required", () => {
    expect(FactionFormSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects a blank name, matching the backend's name_not_blank validator", () => {
    expect(FactionFormSchema.safeParse({ ...valid, name: "   " }).success).toBe(false)
  })

  it("enforces the backend's 120-character name bound", () => {
    expect(FactionFormSchema.safeParse({ ...valid, name: "a".repeat(121) }).success).toBe(false)
    expect(FactionFormSchema.safeParse({ ...valid, name: "a".repeat(120) }).success).toBe(true)
  })

  it("enforces the 500-character ideology bound, distinct from region's 120", () => {
    expect(FactionFormSchema.safeParse({ ...valid, ideology: "a".repeat(501) }).success).toBe(false)
    expect(FactionFormSchema.safeParse({ ...valid, ideology: "a".repeat(500) }).success).toBe(true)
  })

  it("enforces the 2000-character description bound", () => {
    expect(FactionFormSchema.safeParse({ ...valid, description: "a".repeat(2001) }).success).toBe(
      false,
    )
  })

  it("trims surrounding whitespace, as the backend's str_strip_whitespace does", () => {
    const parsed = FactionFormSchema.parse({
      name: "  The Iron Pact  ",
      ideology: "  Order  ",
      description: "",
    })

    expect(parsed.name).toBe("The Iron Pact")
    expect(parsed.ideology).toBe("Order")
  })
})

describe("write mappers", () => {
  it("never echoes server-owned fields back on create", () => {
    const body = toFactionCreateBody({ name: "The Iron Pact", ideology: "Order", description: "" })

    expect(body).not.toHaveProperty("id")
    expect(body).not.toHaveProperty("created_at")
  })

  it("sends empty optional fields as null on create, matching `str | None`", () => {
    const body = toFactionCreateBody({ name: "The Iron Pact", ideology: "   ", description: "" })

    expect(body).toEqual({ name: "The Iron Pact", ideology: null, description: null })
  })

  it("sends only the fields present in an update patch", () => {
    expect(toFactionUpdateBody({ name: "The Iron Pact" })).toEqual({ name: "The Iron Pact" })
    expect(toFactionUpdateBody({ ideology: "Order" })).toEqual({ ideology: "Order" })
  })

  it("clears a field with an empty string, since exclude_none drops null", () => {
    // The backend's PATCH dump uses `exclude_none=True`, so `null` would be
    // silently discarded and the old ideology would survive.
    const body = toFactionUpdateBody({ ideology: "", description: "" })

    expect(body).toEqual({ ideology: "", description: "" })
    expect(body.ideology).not.toBeNull()
  })

  it("round-trips an entity through the edit form without loss", () => {
    const faction = FactionSchema.parse(wireFaction)

    expect(toFactionForm(faction)).toEqual({
      name: "The Iron Pact",
      ideology: "Order through strength; the weak are a debt the strong repay.",
      description: "A military compact of the northern holds.",
    })
  })

  it("represents null optional fields as empty strings in the form", () => {
    const faction = FactionSchema.parse({ ...wireFaction, ideology: null, description: null })
    const form = toFactionForm(faction)

    expect(form.ideology).toBe("")
    expect(form.description).toBe("")
  })
})

describe("list params", () => {
  it("applies the backend's defaults", () => {
    expect(FactionListParamsSchema.parse({})).toMatchObject({
      limit: 20,
      offset: 0,
      sortBy: "name",
      order: "asc",
    })
  })

  it("accepts every field the backend can actually sort by", () => {
    for (const field of ["name", "created_at", "ideology"]) {
      expect(FactionListParamsSchema.parse({ sortBy: field }).sortBy).toBe(field)
    }
  })

  it("falls back to name for a sort the backend would silently ignore", () => {
    // `region` is Location's, not Faction's — the whitelists genuinely differ.
    expect(FactionListParamsSchema.parse({ sortBy: "region" }).sortBy).toBe("name")
  })

  it("keeps an ideology filter as free text rather than validating it against a set", () => {
    expect(FactionListParamsSchema.parse({ ideology: "Order" }).ideology).toBe("Order")
  })

  it("drops a blank ideology filter, which the backend would reject as min_length=1", () => {
    expect(FactionListParamsSchema.parse({ ideology: "   " }).ideology).toBeUndefined()
  })

  it("coerces and clamps pagination values from the URL", () => {
    expect(FactionListParamsSchema.parse({ limit: "50", offset: "100" })).toMatchObject({
      limit: 50,
      offset: 100,
    })
    expect(FactionListParamsSchema.safeParse({ limit: "500" }).success).toBe(false)
  })
})
