import { createBrowserRouter } from "react-router-dom"

import { WorkspaceLayout } from "@/app/shell/WorkspaceLayout"
import { WorkspaceWelcome } from "@/app/shell/WorkspaceWelcome"
import { NotFoundRoute } from "@/routes/not-found"
import { RouteErrorRoute } from "@/routes/route-error"

/**
 * The route tree (docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.2). The root
 * layout route mounts the persistent shell; feature routes are added as lazy
 * children when their slices are implemented (M3+).
 *
 * The error element sits on a pathless route *inside* the layout so a failing
 * view is replaced in place while the shell stays alive. If the layout itself
 * throws, the same element renders standalone at the root.
 */
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
          { path: "*", element: <NotFoundRoute /> },
        ],
      },
    ],
  },
])
