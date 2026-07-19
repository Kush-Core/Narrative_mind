/**
 * The workspace navigation model — the single description of what the app
 * contains and how it is reached.
 *
 * The explorer sidebar, the breadcrumb trail, and the command palette's
 * navigation group are all *projections of this one list*. Adding a destination
 * means adding an entry here; no navigation surface is edited by hand.
 *
 * Entity accents come from the token set (`--entity-*`), so the four entity
 * types carry a consistent, learnable identity colour across every surface
 * (docs/frontend/COMPONENT_HIERARCHY.md §2). Note this file describes
 * *navigation only* — it holds no entity schema, fields, or behaviour.
 */

import {
  CalendarClockIcon,
  CompassIcon,
  FlagIcon,
  type LucideIcon,
  MapPinIcon,
  RouteIcon,
  UsersIcon,
  WaypointsIcon,
} from "lucide-react"

import { paths } from "@/routes/paths"

export interface NavItem {
  id: string
  label: string
  path: string
  icon: LucideIcon
  /** Token-backed text colour class carrying this destination's identity. */
  accentClassName?: string
  /** Shortcut registered as a navigation command (see CommandProvider). */
  shortcut?: string
  /** True while the destination exists as chrome but holds no feature yet. */
  pending?: boolean
}

export interface NavSection {
  id: string
  label: string
  items: NavItem[]
}

export const navSections: NavSection[] = [
  {
    id: "world",
    label: "World",
    items: [
      {
        id: "overview",
        label: "Overview",
        path: paths.root(),
        icon: CompassIcon,
        shortcut: "g o",
      },
    ],
  },
  {
    id: "entities",
    label: "Entities",
    items: [
      {
        id: "characters",
        label: "Characters",
        path: paths.characters.list(),
        icon: UsersIcon,
        accentClassName: "text-entity-character",
        shortcut: "g c",
      },
      {
        id: "locations",
        label: "Locations",
        path: paths.locations.list(),
        icon: MapPinIcon,
        accentClassName: "text-entity-location",
        shortcut: "g l",
      },
      {
        id: "factions",
        label: "Factions",
        path: paths.factions.list(),
        icon: FlagIcon,
        accentClassName: "text-entity-faction",
        shortcut: "g f",
      },
      {
        id: "events",
        label: "Events",
        path: paths.events.list(),
        icon: CalendarClockIcon,
        accentClassName: "text-entity-event",
        shortcut: "g e",
      },
    ],
  },
  {
    id: "reasoning",
    label: "Reasoning",
    items: [
      {
        id: "graph",
        label: "Graph explorer",
        path: paths.graph.explorer(),
        icon: WaypointsIcon,
        shortcut: "g g",
      },
      {
        id: "shortest-path",
        label: "Shortest path",
        path: paths.graph.shortestPath(),
        icon: RouteIcon,
        pending: true,
      },
    ],
  },
]

/** Flattened view, for the command palette and breadcrumb lookup. */
export const navItems: NavItem[] = navSections.flatMap((section) => section.items)

/**
 * The nav item a URL belongs to. Longest match wins so `/graph/shortest-path`
 * resolves to itself rather than to `/graph`; the root is matched exactly.
 */
export function findNavItemByPath(pathname: string): NavItem | undefined {
  return navItems
    .filter((item) =>
      item.path === "/"
        ? pathname === "/"
        : pathname === item.path || pathname.startsWith(`${item.path}/`),
    )
    .sort((a, b) => b.path.length - a.path.length)
    .at(0)
}
