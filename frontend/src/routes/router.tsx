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
 * The full URL contract is mounted now so navigation is genuinely walkable,
 * with `RoutePlaceholder` standing in for the feature slices. As each slice
 * lands (M3+) it replaces its own `element` with a lazily-loaded page and
 * nothing else in this file changes.
 *
 * The error element sits on a pathless route *inside* the layout so a failing
 * view is replaced in place while the shell stays alive. If the layout itself
 * throws, the same element renders standalone at the root.
 */
const placeholderPaths = [
  paths.characters.list(),
  paths.locations.list(),
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
          ...placeholderPaths.map((path) => ({ path, element: <RoutePlaceholder /> })),
          { path: "*", element: <NotFoundRoute /> },
        ],
      },
    ],
  },
])
