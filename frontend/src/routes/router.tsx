import { createBrowserRouter } from "react-router-dom"

import { WorkspaceLayout } from "@/app/shell/WorkspaceLayout"
import { WorkspaceWelcome } from "@/app/shell/WorkspaceWelcome"
import { NotFoundRoute } from "@/routes/not-found"
import { paths } from "@/routes/paths"
import { RouteErrorRoute } from "@/routes/route-error"
import { RoutePlaceholder } from "@/routes/route-placeholder"

/**
 * The route tree (docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.2). The root
 * layout route mounts the persistent shell; every child renders into its
 * `<Outlet/>`.
 *
 * Feature routes use React Router's own `lazy` property rather than
 * `React.lazy` + `Suspense`: the router already knows how to defer a route and
 * keeps the current view on screen while the next chunk downloads, which is a
 * better transition than swapping in a fallback. Each slice is still its own
 * chunk, so the graph feature's eventual visualization dependency never lands
 * in the initial bundle (docs/frontend/FRONTEND_ARCHITECTURE.md §7.3).
 *
 * Slices not yet built mount `RoutePlaceholder`, so every navigation
 * destination stays walkable.
 *
 * The error element sits on a pathless route *inside* the layout so a failing
 * view is replaced in place while the shell stays alive. If the layout itself
 * throws, the same element renders standalone at the root.
 */

/** Destinations whose slices are still to come (M5+). */
const placeholderPaths = [
  paths.factions.list(),
  paths.events.list(),
  paths.graph.explorer(),
  paths.graph.shortestPath(),
]

export const router = createBrowserRouter([
  {
    path: "/",
    element: <WorkspaceLayout />,
    errorElement: <RouteErrorRoute />,
    children: [
      {
        errorElement: <RouteErrorRoute />,
        children: [
          { index: true, element: <WorkspaceWelcome /> },

          {
            path: paths.characters.list(),
            lazy: async () => {
              const { CharacterListPage } = await import("@/features/characters")
              return { Component: CharacterListPage }
            },
          },
          {
            path: paths.characters.detail(":characterId"),
            lazy: async () => {
              const { CharacterDetailPage } = await import("@/features/characters")
              return { Component: CharacterDetailPage }
            },
          },

          {
            path: paths.locations.list(),
            lazy: async () => {
              const { LocationListPage } = await import("@/features/locations")
              return { Component: LocationListPage }
            },
          },
          {
            path: paths.locations.detail(":locationId"),
            lazy: async () => {
              const { LocationDetailPage } = await import("@/features/locations")
              return { Component: LocationDetailPage }
            },
          },

          ...placeholderPaths.map((path) => ({ path, element: <RoutePlaceholder /> })),
          { path: "*", element: <NotFoundRoute /> },
        ],
      },
    ],
  },
])
