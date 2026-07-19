/**
 * The relationship catalog and, more importantly, the anchor rule.
 *
 * The role logic is the one piece of this feature that is easy to get quietly
 * wrong: the backend accepts only a Character as a relationship's source, so
 * treating the entity a dialog was opened from as the source would 404 on three
 * of the four detail screens. That rule is pinned here.
 */

import { describe, expect, it } from "vitest"

import { ENTITY_KINDS } from "@/shared/domain/entity-kinds"
import {
  canRelate,
  endpointsForEntity,
  isRelationshipType,
  RELATIONSHIP_TYPE_DEFINITIONS,
  RELATIONSHIP_TYPES,
  type RelationshipEndpoint,
  relationshipRoleFor,
  relationshipTypeDefinition,
  relationshipTypesForEndpoints,
  resolveRelationshipEndpoints,
} from "@/shared/domain/relationships"

function endpoint(kind: RelationshipEndpoint["kind"], name: string): RelationshipEndpoint {
  return { id: `${kind}-${name}`, name, kind }
}

describe("the catalog", () => {
  it("matches the backend's allowed set exactly", () => {
    // `_ALLOWED_REL_TYPES` in services/graph_service.py. Anything else is a 422.
    expect([...RELATIONSHIP_TYPES]).toEqual(["KNOWS", "MEMBER_OF", "LOCATED_IN", "PARTICIPATED_IN"])
  })

  it("defines every type it declares", () => {
    for (const type of RELATIONSHIP_TYPES) {
      expect(relationshipTypeDefinition(type).type).toBe(type)
    }
  })

  it("points each type at a distinct entity kind", () => {
    // One type per kind is what lets the chosen type determine which collection
    // the target picker searches without any further disambiguation.
    const kinds = RELATIONSHIP_TYPE_DEFINITIONS.map((definition) => definition.targetKind)
    expect(new Set(kinds).size).toBe(kinds.length)
    expect(new Set(kinds)).toEqual(new Set(ENTITY_KINDS))
  })

  it("supports sentiment only on KNOWS", () => {
    const withSentiment = RELATIONSHIP_TYPE_DEFINITIONS.filter(
      (definition) => definition.supportsSentiment,
    )
    expect(withSentiment.map((definition) => definition.type)).toEqual(["KNOWS"])
  })

  it("recognises its own types and rejects anything else", () => {
    expect(isRelationshipType("KNOWS")).toBe(true)
    expect(isRelationshipType("knows")).toBe(false)
    expect(isRelationshipType("RULES")).toBe(false)
  })
})

describe("endpoint roles", () => {
  it("makes a Character the source", () => {
    expect(relationshipRoleFor("Character")).toBe("source")
  })

  it("makes every other kind the target", () => {
    // Not a stylistic choice: `MATCH (source:Character {id: $source_id})` means
    // a Faction id as source matches nothing.
    for (const kind of ENTITY_KINDS.filter((candidate) => candidate !== "Character")) {
      expect(relationshipRoleFor(kind)).toBe("target")
    }
  })

  it("fixes a Character as the source end", () => {
    expect(endpointsForEntity("Character", "c-1", "Mira")).toEqual({
      source: { id: "c-1", name: "Mira", kind: "Character" },
    })
  })

  it("fixes every other kind as the target end", () => {
    expect(endpointsForEntity("Faction", "f-1", "The Tidebinders")).toEqual({
      target: { id: "f-1", name: "The Tidebinders", kind: "Faction" },
    })
  })
})

describe("types offered for fixed endpoints", () => {
  it("offers every type when only the source is fixed", () => {
    const endpoints = endpointsForEntity("Character", "c-1", "Mira")
    expect(relationshipTypesForEndpoints(endpoints)).toHaveLength(RELATIONSHIP_TYPES.length)
  })

  it("offers every type when nothing is fixed", () => {
    expect(relationshipTypesForEndpoints(undefined)).toHaveLength(RELATIONSHIP_TYPES.length)
  })

  it("narrows to the types that point at a fixed target's kind", () => {
    // From a Faction the only expressible statement is membership; the other
    // three would be offering ways to write something meaningless.
    const cases = [
      ["Faction", "MEMBER_OF"],
      ["Location", "LOCATED_IN"],
      ["Event", "PARTICIPATED_IN"],
    ] as const

    for (const [kind, expected] of cases) {
      const endpoints = endpointsForEntity(kind, "x-1", "Something")
      expect(relationshipTypesForEndpoints(endpoints).map((d) => d.type)).toEqual([expected])
    }
  })
})

describe("canRelate — what the graph may offer as a destination", () => {
  it("allows any pairing that includes a Character", () => {
    for (const kind of ENTITY_KINDS) {
      expect(canRelate("Character", kind)).toBe(true)
      expect(canRelate(kind, "Character")).toBe(true)
    }
  })

  it("refuses a pairing with no Character in it", () => {
    // There is no request that would create a Location→Faction edge; the write
    // endpoint is a sub-resource of a character.
    expect(canRelate("Location", "Faction")).toBe(false)
    expect(canRelate("Event", "Location")).toBe(false)
  })
})

describe("resolveRelationshipEndpoints — which end is which", () => {
  it("makes the Character the source when it is the one started from", () => {
    const result = resolveRelationshipEndpoints(
      endpoint("Character", "Mira"),
      endpoint("Faction", "Tidebinders"),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.endpoints.source.name).toBe("Mira")
    expect(result.endpoints.target.name).toBe("Tidebinders")
  })

  it("inverts the direction when only the destination can be a source", () => {
    // Starting a connection from a Location is meaningful; it just means the
    // character being picked is the source.
    const result = resolveRelationshipEndpoints(
      endpoint("Location", "Greyfen"),
      endpoint("Character", "Mira"),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.endpoints.source.name).toBe("Mira")
    expect(result.endpoints.target.name).toBe("Greyfen")
  })

  it("keeps the gesture's direction when both ends are Characters", () => {
    // `from` knows `to`, not the reverse — the edge should match what the user
    // drew, since both orderings are expressible.
    const result = resolveRelationshipEndpoints(
      endpoint("Character", "Mira"),
      endpoint("Character", "Corin"),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.endpoints.source.name).toBe("Mira")
    expect(result.endpoints.target.name).toBe("Corin")
  })

  it("refuses a pairing the backend could not express, and says why", () => {
    const result = resolveRelationshipEndpoints(
      endpoint("Location", "Greyfen"),
      endpoint("Faction", "Salt Guild"),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain("must involve a character")
  })
})
