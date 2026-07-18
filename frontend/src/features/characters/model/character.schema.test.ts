/**
 * The Character contract, pinned against the real backend model
 * (`backend/src/narrative_mind/domain/character.py`).
 *
 * These tests are the guard on the anti-corruption boundary: if the backend's
 * shape or semantics change, they fail here rather than three screens away.
 */

import { describe, expect, it } from "vitest"

import {
  CharacterFormSchema,
  CharacterListParamsSchema,
  CharacterSchema,
  deriveDisplayName,
  toCharacterCreateBody,
  toCharacterForm,
  toCharacterUpdateBody,
} from "@/features/characters/model/character.schema"

const wireCharacter = {
  id: "c-1",
  name: "Aria Vane",
  aliases: ["The Ashen"],
  status: "alive",
  description: "A cartographer of dead cities.",
  created_at: "2026-07-18T10:00:00+00:00",
  display_name: "Aria Vane (The Ashen)",
}

describe("read model", () => {
  it("maps the wire shape to camelCase domain fields", () => {
    const character = CharacterSchema.parse(wireCharacter)

    expect(character).toEqual({
      id: "c-1",
      name: "Aria Vane",
      aliases: ["The Ashen"],
      status: "alive",
      description: "A cartographer of dead cities.",
      createdAt: "2026-07-18T10:00:00+00:00",
      displayName: "Aria Vane (The Ashen)",
    })
  })

  it("normalizes a null description to null rather than undefined", () => {
    const character = CharacterSchema.parse({ ...wireCharacter, description: null })

    expect(character.description).toBeNull()
  })

  it("derives displayName when the computed field is absent", () => {
    const { display_name: _omitted, ...withoutComputed } = wireCharacter
    const character = CharacterSchema.parse(withoutComputed)

    expect(character.displayName).toBe("Aria Vane (The Ashen)")
  })

  it("derives displayName as the bare name when there are no aliases", () => {
    expect(deriveDisplayName("Aria Vane", [])).toBe("Aria Vane")
    expect(deriveDisplayName("Aria Vane", ["The Ashen", "Vane"])).toBe("Aria Vane (The Ashen)")
  })

  it("defaults a missing aliases list rather than failing", () => {
    const { aliases: _omitted, ...withoutAliases } = wireCharacter
    expect(CharacterSchema.parse(withoutAliases).aliases).toEqual([])
  })

  it("degrades an unrecognised status instead of rejecting the record", () => {
    // A new backend status should not make an entity unreadable.
    expect(CharacterSchema.parse({ ...wireCharacter, status: "ascended" }).status).toBe("unknown")
  })
})

describe("form validation", () => {
  const valid = { name: "Aria Vane", aliases: [], status: "alive" as const, description: "" }

  it("accepts a minimal valid character", () => {
    expect(CharacterFormSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects a blank name, matching the backend's name_not_blank validator", () => {
    expect(CharacterFormSchema.safeParse({ ...valid, name: "   " }).success).toBe(false)
  })

  it("enforces the backend's 120-character name bound", () => {
    expect(CharacterFormSchema.safeParse({ ...valid, name: "a".repeat(121) }).success).toBe(false)
    expect(CharacterFormSchema.safeParse({ ...valid, name: "a".repeat(120) }).success).toBe(true)
  })

  it("enforces the 2000-character description bound", () => {
    expect(CharacterFormSchema.safeParse({ ...valid, description: "a".repeat(2001) }).success).toBe(
      false,
    )
  })

  it("enforces the 10-alias cap", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => `alias-${index}`)
    expect(CharacterFormSchema.safeParse({ ...valid, aliases: eleven }).success).toBe(false)
  })

  it("dedupes aliases case-insensitively, mirroring dedupe_aliases", () => {
    const parsed = CharacterFormSchema.parse({
      ...valid,
      aliases: ["The Ashen", "the ashen", "Vane"],
    })

    expect(parsed.aliases).toEqual(["The Ashen", "Vane"])
  })

  it("trims surrounding whitespace on the name, as the backend does", () => {
    expect(CharacterFormSchema.parse({ ...valid, name: "  Aria  " }).name).toBe("Aria")
  })
})

describe("write mappers", () => {
  it("never echoes the read-only display_name back on create", () => {
    const body = toCharacterCreateBody({
      name: "Aria Vane",
      aliases: ["The Ashen"],
      status: "alive",
      description: "",
    })

    expect(body).not.toHaveProperty("display_name")
    expect(body).not.toHaveProperty("displayName")
    expect(body).not.toHaveProperty("id")
    expect(body).not.toHaveProperty("created_at")
  })

  it("sends an empty description as null on create, matching `str | None`", () => {
    const body = toCharacterCreateBody({
      name: "Aria",
      aliases: [],
      status: "alive",
      description: "   ",
    })

    expect(body.description).toBeNull()
  })

  it("sends only the fields present in an update patch", () => {
    expect(toCharacterUpdateBody({ name: "Grace" })).toEqual({ name: "Grace" })
    expect(toCharacterUpdateBody({ status: "dead" })).toEqual({ status: "dead" })
  })

  it("clears a description with an empty string, since exclude_none drops null", () => {
    // The backend's PATCH dump uses `exclude_none=True`, so `null` would be
    // silently discarded and the old description would survive.
    const body = toCharacterUpdateBody({ description: "" })

    expect(body).toEqual({ description: "" })
    expect(body.description).not.toBeNull()
  })

  it("round-trips an entity through the edit form without loss", () => {
    const character = CharacterSchema.parse(wireCharacter)
    const form = toCharacterForm(character)

    expect(form).toEqual({
      name: "Aria Vane",
      aliases: ["The Ashen"],
      status: "alive",
      description: "A cartographer of dead cities.",
    })
    // Aliases must be a copy: editing the form must not mutate the cached entity.
    expect(form.aliases).not.toBe(character.aliases)
  })

  it("represents a null description as an empty string in the form", () => {
    const character = CharacterSchema.parse({ ...wireCharacter, description: null })
    expect(toCharacterForm(character).description).toBe("")
  })
})

describe("list params", () => {
  it("applies the backend's defaults", () => {
    expect(CharacterListParamsSchema.parse({})).toMatchObject({
      limit: 20,
      offset: 0,
      sortBy: "name",
      order: "asc",
    })
  })

  it("accepts every field the backend can actually sort by", () => {
    for (const field of ["name", "created_at", "status"]) {
      expect(CharacterListParamsSchema.parse({ sortBy: field }).sortBy).toBe(field)
    }
  })

  it("falls back to name for a sort the backend would silently ignore", () => {
    expect(CharacterListParamsSchema.parse({ sortBy: "description" }).sortBy).toBe("name")
  })

  it("keeps a valid status filter and drops an invalid one", () => {
    expect(CharacterListParamsSchema.parse({ status: "dead" }).status).toBe("dead")
    expect(CharacterListParamsSchema.parse({ status: "haunted" }).status).toBeUndefined()
  })

  it("coerces and clamps pagination values from the URL", () => {
    expect(CharacterListParamsSchema.parse({ limit: "50", offset: "100" })).toMatchObject({
      limit: 50,
      offset: 100,
    })
    expect(CharacterListParamsSchema.safeParse({ limit: "500" }).success).toBe(false)
  })
})
