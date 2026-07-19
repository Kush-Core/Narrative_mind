import type { ComponentType } from "react"
import { createBrowserRouter, type RouteObject } from "react-router-dom"

import { WorkspaceLayout } from "@/app/shell/WorkspaceLayout"
import { WorkspaceWelcome } from "@/app/shell/WorkspaceWelcome"
import { NotFoundRoute } from "@/routes/not-found"
import { paths } from "@/routes/paths"
import { RouteErrorRoute } from "@/routes/route-error"
import { RoutePlaceholder } from "@/routes/route-placeholder"
import { ENTITY_ID_PARAM } from "@/shared/entity-kit/route-params"

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

/**
 * The list + detail route pair every entity slice mounts.
 *
 * Beyond removing four repetitions, this makes one coupling structural: the
 * detail param is named `:id` here and *only* here, and
 * `EntityDetailPage` reads exactly that name. Spelled out per entity, a
 * `:factionId` typo would compile, route, and then fail at runtime with an
 * undefined id. There is now one place to get it right.
 *
 * Both routes await the same dynamic import; the module is cached after the
 * first, and only one of the two ever matches a given URL.
 */
function entityRoutes(
  routes: { list: () => string; detail: (id: string) => string },
  load: () => Promise<{ list: ComponentType; detail: ComponentType }>,
): RouteObject[] {
  return [
    { path: routes.list(), lazy: async () => ({ Component: (await load()).list }) },
    {
      path: routes.detail(`:${ENTITY_ID_PARAM}`),
      lazy: async () => ({ Component: (await load()).detail }),
    },
  ]
}

/** Destinations whose slices are still to come (M6+). */
const placeholderPaths = [paths.graph.explorer(), paths.graph.shortestPath()]

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

          ...entityRoutes(paths.characters, async () => {
            const slice = await import("@/features/characters")
            return { list: slice.CharacterListPage, detail: slice.CharacterDetailPage }
          }),

          ...entityRoutes(paths.locations, async () => {
            const slice = await import("@/features/locations")
            return { list: slice.LocationListPage, detail: slice.LocationDetailPage }
          }),

          ...entityRoutes(paths.factions, async () => {
            const slice = await import("@/features/factions")
            return { list: slice.FactionListPage, detail: slice.FactionDetailPage }
          }),

          ...entityRoutes(paths.events, async () => {
            const slice = await import("@/features/events")
            return { list: slice.EventListPage, detail: slice.EventDetailPage }
          }),

          ...placeholderPaths.map((path) => ({ path, element: <RoutePlaceholder /> })),
          { path: "*", element: <NotFoundRoute /> },
        ],
      },
    ],
  },
])
