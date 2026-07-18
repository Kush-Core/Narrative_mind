/**
 * Typed path builders — the single source of URL strings
 * (docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.2). No route string is ever
 * hand-typed in a component; links and navigation go through these builders.
 *
 * Builders exist for the full approved route map even though feature routes
 * mount in later milestones — the URL contract is stable now.
 */

export const paths = {
  root: () => "/",

  characters: {
    list: () => "/characters",
    detail: (id: string) => `/characters/${id}`,
  },
  locations: {
    list: () => "/locations",
    detail: (id: string) => `/locations/${id}`,
  },
  factions: {
    list: () => "/factions",
    detail: (id: string) => `/factions/${id}`,
  },
  events: {
    list: () => "/events",
    detail: (id: string) => `/events/${id}`,
  },

  graph: {
    explorer: () => "/graph",
    shortestPath: () => "/graph/shortest-path",
  },
} as const
