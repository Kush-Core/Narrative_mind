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
  isRelationshipType,
  RELATIONSHIP_TYPE_DEFINITIONS,
  RELATIONSHIP_TYPES,
  relationshipAnchor,
  relationshipRoleFor,
  relationshipTypeDefinition,
  relationshipTypesForAnchor,
} from "@/shared/domain/relationships"

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

describe("anchor roles", () => {
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

  it("carries the entity's identity alongside its role", () => {
    expect(relationshipAnchor("Faction", "f-1", "The Tidebinders")).toEqual({
      role: "target",
      kind: "Faction",
      id: "f-1",
      name: "The Tidebinders",
    })
  })
})

describe("types offered for an anchor", () => {
  it("offers every type when the anchor is the source", () => {
    const anchor = relationshipAnchor("Character", "c-1", "Mira")
    expect(relationshipTypesForAnchor(anchor)).toHaveLength(RELATIONSHIP_TYPES.length)
  })

  it("offers every type when there is no anchor at all", () => {
    expect(relationshipTypesForAnchor(undefined)).toHaveLength(RELATIONSHIP_TYPES.length)
  })

  it("narrows to the types that point at a pinned target's kind", () => {
    // From a Faction page the only expressible statement is membership; the
    // other three would be offering ways to write something meaningless.
    expect(
      relationshipTypesForAnchor(relationshipAnchor("Faction", "f-1", "Salt Guild")).map(
        (definition) => definition.type,
      ),
    ).toEqual(["MEMBER_OF"])

    expect(
      relationshipTypesForAnchor(relationshipAnchor("Location", "l-1", "Greyfen")).map(
        (definition) => definition.type,
      ),
    ).toEqual(["LOCATED_IN"])

    expect(
      relationshipTypesForAnchor(relationshipAnchor("Event", "e-1", "The Drowning")).map(
        (definition) => definition.type,
      ),
    ).toEqual(["PARTICIPATED_IN"])
  })
})
