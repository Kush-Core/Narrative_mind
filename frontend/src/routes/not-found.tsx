import { Link } from "react-router-dom"

import { paths } from "@/routes/paths"
import { Button } from "@/shared/ui/button"

/** Rendered for any URL that matches no route. */
export function NotFoundRoute() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8">
      <h1 className="text-lg font-semibold">Nothing here</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        This page does not exist in the workspace.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to={paths.root()}>Back to the workspace</Link>
      </Button>
    </div>
  )
}
