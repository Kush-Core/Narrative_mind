/**
 * What the four entity types *are*, independent of how they are edited.
 *
 * The CRUD descriptors (each slice's `model` directory) already carry each
 * entity's display name, icon, and accent — but they carry it bundled with a Zod
 * schema, a resource, form fields, and table columns. The Graph subsystem needs
 * the identity and none of the rest: it colours a node by the Neo4j label the
 * backend returns and links through to that entity's detail route. Importing a
 * descriptor to get a colour would drag the whole CRUD stack of four slices into
 * the graph bundle and couple two subsystems that should stay peers.
 *
 * So identity lives here — the smallest shared fact about an entity type, with
 * no dependency on the entity engine or on any feature slice.
 *
 * **Keyed by the Neo4j node label**, because that is the form the backend speaks
 * in graph responses (`labels: labels(n)`), and translating at the boundary is
 * this module's job.
 */

import { CalendarClockIcon, FlagIcon, type LucideIcon, MapPinIcon, UsersIcon } from "lucide-react"

import { paths } from "@/routes/paths"
import type { EntityCollection } from "@/shared/api/endpoints"

/** The node labels the backend applies (analysis §Neo4j Integration). */
export const ENTITY_KINDS = ["Character", "Location", "Faction", "Event"] as const

export type EntityKind = (typeof ENTITY_KINDS)[number]

/**
 * A node whose label we do not recognise. The graph renders these rather than
 * dropping them: an unknown node is information, and silently hiding part of a
 * network would be worse than showing it plainly.
 */
export const UNKNOWN_KIND = "Unknown" as const

export type NodeKind = EntityKind | typeof UNKNOWN_KIND

export interface EntityKindIdentity {
  kind: NodeKind
  /** The backing collection, absent for unrecognised labels. */
  collection?: EntityCollection
  singular: string
  plural: string
  icon: LucideIcon
  /** Tailwind text colour class, for DOM surfaces. */
  accentClassName: string
  /**
   * The CSS custom property holding this kind's accent.
   *
   * Canvas renderers cannot use a Tailwind class — Cytoscape paints to a
   * `<canvas>` and needs a concrete colour string. Naming the *variable* here
   * (rather than duplicating an oklch literal) keeps `styles/tokens.css` the
   * single source of colour, with the renderer resolving it at runtime.
   */
  accentVar: string
  /** Detail route for this kind, absent when there is nothing to link to. */
  detailPath?: (id: string) => string
}

const IDENTITIES: Record<NodeKind, EntityKindIdentity> = {
  Character: {
    kind: "Character",
    collection: "characters",
    singular: "Character",
    plural: "Characters",
    icon: UsersIcon,
    accentClassName: "text-entity-character",
    accentVar: "--entity-character",
    detailPath: (id) => paths.characters.detail(id),
  },
  Location: {
    kind: "Location",
    collection: "locations",
    singular: "Location",
    plural: "Locations",
    icon: MapPinIcon,
    accentClassName: "text-entity-location",
    accentVar: "--entity-location",
    detailPath: (id) => paths.locations.detail(id),
  },
  Faction: {
    kind: "Faction",
    collection: "factions",
    singular: "Faction",
    plural: "Factions",
    icon: FlagIcon,
    accentClassName: "text-entity-faction",
    accentVar: "--entity-faction",
    detailPath: (id) => paths.factions.detail(id),
  },
  Event: {
    kind: "Event",
    collection: "events",
    singular: "Event",
    plural: "Events",
    icon: CalendarClockIcon,
    accentClassName: "text-entity-event",
    accentVar: "--entity-event",
    detailPath: (id) => paths.events.detail(id),
  },
  Unknown: {
    kind: UNKNOWN_KIND,
    singular: "Unknown",
    plural: "Unknown",
    icon: UsersIcon,
    accentClassName: "text-muted-foreground",
    accentVar: "--muted-foreground",
  },
}

export function entityKindIdentity(kind: NodeKind): EntityKindIdentity {
  return IDENTITIES[kind]
}

/**
 * Resolve the node kind from the labels a graph response carries.
 *
 * Neo4j returns an array because a node may carry several labels; the first
 * recognised one wins, and anything unrecognised degrades to `Unknown` rather
 * than throwing. A new backend label should make a node render plainly, not make
 * the whole graph fail to load.
 */
export function toNodeKind(labels: readonly string[] | null | undefined): NodeKind {
  const match = labels?.find((label): label is EntityKind =>
    (ENTITY_KINDS as readonly string[]).includes(label),
  )
  return match ?? UNKNOWN_KIND
}

/** Every identity that maps to a real collection — for legends and filters. */
export const ENTITY_KIND_IDENTITIES: EntityKindIdentity[] = ENTITY_KINDS.map(entityKindIdentity)
