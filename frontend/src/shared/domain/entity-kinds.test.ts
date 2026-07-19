/**
 * The shared entity-identity registry.
 *
 * Its job is to translate the backend's Neo4j labels into app presentation, and
 * to degrade rather than fail on labels it has never seen — a new backend label
 * should cost a colour, not the whole graph.
 */

import { describe, expect, it } from "vitest"

import {
  ENTITY_KIND_IDENTITIES,
  ENTITY_KINDS,
  entityKindIdentity,
  toNodeKind,
} from "@/shared/domain/entity-kinds"

describe("toNodeKind", () => {
  it("resolves each label the backend applies", () => {
    for (const kind of ENTITY_KINDS) {
      expect(toNodeKind([kind])).toBe(kind)
    }
  })

  it("takes the first recognised label when a node carries several", () => {
    expect(toNodeKind(["Character", "Location"])).toBe("Character")
  })

  it("skips unrecognised labels to find a known one", () => {
    expect(toNodeKind(["Deprecated", "Faction"])).toBe("Faction")
  })

  it("degrades an entirely unknown label rather than throwing", () => {
    expect(toNodeKind(["Prophecy"])).toBe("Unknown")
  })

  it("handles absent labels, which the projection may omit", () => {
    expect(toNodeKind([])).toBe("Unknown")
    expect(toNodeKind(null)).toBe("Unknown")
    expect(toNodeKind(undefined)).toBe("Unknown")
  })
})

describe("entityKindIdentity", () => {
  it("gives every real entity kind a collection and a detail route", () => {
    for (const identity of ENTITY_KIND_IDENTITIES) {
      expect(identity.collection).toBeDefined()
      expect(identity.detailPath?.("abc")).toContain("abc")
    }
  })

  it("gives the unknown kind no route, since there is nothing to open", () => {
    const unknown = entityKindIdentity("Unknown")

    expect(unknown.collection).toBeUndefined()
    expect(unknown.detailPath).toBeUndefined()
  })

  it("names a CSS variable for every kind, so the canvas can resolve a colour", () => {
    // The renderer paints to a canvas and cannot use a Tailwind class; naming
    // the token keeps `tokens.css` the single source of colour.
    for (const identity of ENTITY_KIND_IDENTITIES) {
      expect(identity.accentVar).toMatch(/^--/)
      expect(identity.accentClassName).toContain("text-")
    }
  })

  it("routes each kind to its own collection's detail path", () => {
    expect(entityKindIdentity("Character").detailPath?.("x")).toBe("/characters/x")
    expect(entityKindIdentity("Location").detailPath?.("x")).toBe("/locations/x")
    expect(entityKindIdentity("Faction").detailPath?.("x")).toBe("/factions/x")
    expect(entityKindIdentity("Event").detailPath?.("x")).toBe("/events/x")
  })
})
