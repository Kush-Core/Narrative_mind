import { Link, useRouteError } from "react-router-dom"

import { paths } from "@/routes/paths"
import { Button } from "@/shared/ui/button"

/**
 * Router-level error element: catches loader/render failures inside the route
 * tree so the surrounding shell (and the rest of the app) stays alive.
 */
export function RouteErrorRoute() {
  const error = useRouteError()
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred while rendering."

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8">
      <h1 className="text-lg font-semibold">This view failed to load</h1>
      <p className="max-w-md text-center text-sm text-muted-foreground">{message}</p>
      <Button asChild variant="outline" size="sm">
        <Link to={paths.root()}>Back to the workspace</Link>
      </Button>
    </div>
  )
}
