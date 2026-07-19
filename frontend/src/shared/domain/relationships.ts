/**
 * What a relationship *is* — the catalog, independent of how it is created.
 *
 * Sibling to `entity-kinds.ts`: that module says what the four entity types are,
 * this one says how they may be joined. Both are the smallest shared facts about
 * the domain, with no dependency on the entity engine or any feature slice.
 *
 * ---------------------------------------------------------------------------
 * The backend contract this encodes (verified, not assumed)
 * ---------------------------------------------------------------------------
 *
 * `POST /characters/{character_id}/relationships` — and there is no other
 * relationship write endpoint. Three facts follow from reading
 * `services/graph_service.py` and `repositories/graph_repo.py`:
 *
 *  1. **The source must be a Character.** The Cypher is
 *     `MATCH (source:Character {id: $source_id})`, so a Faction or Event id as
 *     source matches nothing and the write 404s. This is not a convention the
 *     UI could choose to break — it is enforced by the query.
 *  2. **`rel_type` is a closed set** — `_ALLOWED_REL_TYPES` in the service.
 *     Anything else is rejected with a 422 before it reaches the database.
 *  3. **The target's type is *not* enforced.** The Cypher matches an unlabelled
 *     `(target {id: $target_id})`, checking only that the node exists. So the
 *     backend would happily record `MEMBER_OF` pointing at an Event.
 *
 * Fact 3 is why `targetKind` below is called guidance. The UI leads writers to
 * the pairing each type is *for* rather than enforcing one the backend does not,
 * which keeps the client from inventing a rule the server would not honour.
 */

import type { EntityKind } from "@/shared/domain/entity-kinds"

/** The relationship types the backend accepts (`_ALLOWED_REL_TYPES`). */
export const RELATIONSHIP_TYPES = ["KNOWS", "MEMBER_OF", "LOCATED_IN", "PARTICIPATED_IN"] as const

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number]

export interface RelationshipTypeDefinition {
  type: RelationshipType
  /** Sentence-case label for menus and summaries. */
  label: string
  /**
   * Reads as a predicate between the two entities, so a review line can be
   * assembled as `<source> <phrase> <target>`.
   */
  phrase: string
  /** What this relationship is for, shown as help text while choosing. */
  description: string
  /**
   * The entity kind this relationship conventionally points at.
   *
   * Guidance, not enforcement — see the note above. It determines which
   * collection the target picker searches, which is what makes the choice
   * unambiguous for the writer.
   */
  targetKind: EntityKind
  /**
   * Whether `sentiment` means anything for this type.
   *
   * The backend stores whatever it is given on any edge, but only `KNOWS`
   * describes a stance one character holds toward another. Showing the field
   * elsewhere would invite data no reader will ever see.
   */
  supportsSentiment: boolean
}

const DEFINITIONS: Record<RelationshipType, RelationshipTypeDefinition> = {
  KNOWS: {
    type: "KNOWS",
    label: "Knows",
    phrase: "knows",
    description: "One character's standing relationship with another.",
    targetKind: "Character",
    supportsSentiment: true,
  },
  MEMBER_OF: {
    type: "MEMBER_OF",
    label: "Member of",
    phrase: "is a member of",
    description: "The character belongs to this faction.",
    targetKind: "Faction",
    supportsSentiment: false,
  },
  LOCATED_IN: {
    type: "LOCATED_IN",
    label: "Located in",
    phrase: "is located in",
    description: "Where the character is, or is based.",
    targetKind: "Location",
    supportsSentiment: false,
  },
  PARTICIPATED_IN: {
    type: "PARTICIPATED_IN",
    label: "Participated in",
    phrase: "took part in",
    description: "The character was involved in this event.",
    targetKind: "Event",
    supportsSentiment: false,
  },
}

export function relationshipTypeDefinition(type: RelationshipType): RelationshipTypeDefinition {
  return DEFINITIONS[type]
}

/** Every definition, in the order writers see them. */
export const RELATIONSHIP_TYPE_DEFINITIONS: RelationshipTypeDefinition[] = RELATIONSHIP_TYPES.map(
  relationshipTypeDefinition,
)

export function isRelationshipType(value: string): value is RelationshipType {
  return (RELATIONSHIP_TYPES as readonly string[]).includes(value)
}

/* ---------------------------------------------------------------- endpoints */

/**
 * One end of a relationship, already identified.
 *
 * Carries the name as well as the id because every surface that pins an end also
 * has to *show* it, and re-fetching a label the caller was just handed would be
 * a request for a word.
 */
export interface RelationshipEndpoint {
  id: string
  name: string
  kind: EntityKind
}

/**
 * Which ends of a relationship are already decided.
 *
 * This is the crux of letting one dialog serve every surface. Because the
 * backend requires a Character source (fact 1 above), "the entity you started
 * from" cannot always be the source:
 *
 *  - From a **Character**, it is the source, and the writer picks the target.
 *  - From a **Location, Faction, or Event**, it can only be the *target*, and
 *    the writer picks which character connects to it.
 *  - From the **graph**, connecting two nodes decides *both* — and which is
 *    which is likewise forced by the same rule.
 *
 * Modelling it as "the fixed ends" rather than as "the anchor and its role"
 * covers all three without the dialog knowing which surface opened it.
 */
export interface RelationshipEndpoints {
  source?: RelationshipEndpoint
  target?: RelationshipEndpoint
}

export type RelationshipRole = "source" | "target"

/** Which end of a relationship an entity of this kind is able to occupy. */
export function relationshipRoleFor(kind: EntityKind): RelationshipRole {
  return kind === "Character" ? "source" : "target"
}

/** The endpoints implied by opening a relationship flow *from* one entity. */
export function endpointsForEntity(
  kind: EntityKind,
  id: string,
  name: string,
): RelationshipEndpoints {
  const endpoint: RelationshipEndpoint = { id, name, kind }
  return relationshipRoleFor(kind) === "source" ? { source: endpoint } : { target: endpoint }
}

/**
 * Whether a relationship between these two kinds is expressible at all.
 *
 * At least one end must be a Character, because the write endpoint is a
 * sub-resource of one. A Location-to-Faction edge is not "unsupported by the
 * UI" — there is no request that would create it.
 *
 * This is what the graph's connect mode uses to mark valid and invalid
 * destinations, so the affordance and the backend agree by construction.
 */
export function canRelate(a: EntityKind, b: EntityKind): boolean {
  return a === "Character" || b === "Character"
}

export type RelationshipResolution =
  { ok: true; endpoints: Required<RelationshipEndpoints> } | { ok: false; reason: string }

/**
 * Decide which of two chosen entities is the source and which is the target.
 *
 * Used when *both* ends are picked before a type is — the graph's connect flow.
 * The Character becomes the source because nothing else can be; when both are
 * Characters the one the user started from wins, which keeps the direction
 * matching the gesture (`from` knows `to`, not the reverse).
 */
export function resolveRelationshipEndpoints(
  from: RelationshipEndpoint,
  to: RelationshipEndpoint,
): RelationshipResolution {
  if (from.kind === "Character") return { ok: true, endpoints: { source: from, target: to } }
  if (to.kind === "Character") return { ok: true, endpoints: { source: to, target: from } }

  return {
    ok: false,
    reason: `A relationship must involve a character. ${from.name} and ${to.name} cannot be connected directly.`,
  }
}

/**
 * The relationship types offered for a set of fixed endpoints.
 *
 * A known target narrows the list to the types that point at its kind — from a
 * Faction the only sensible relationship is `MEMBER_OF`, so offering the other
 * three would be offering three ways to write something meaningless. An unknown
 * target constrains nothing, because the type is what will decide its kind.
 */
export function relationshipTypesForEndpoints(
  endpoints: RelationshipEndpoints | undefined,
): RelationshipTypeDefinition[] {
  const targetKind = endpoints?.target?.kind
  if (!targetKind) return RELATIONSHIP_TYPE_DEFINITIONS
  return RELATIONSHIP_TYPE_DEFINITIONS.filter((definition) => definition.targetKind === targetKind)
}
