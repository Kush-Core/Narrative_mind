import { appConfig } from "@/shared/config/env"
import { Button } from "@/shared/ui/button"

/**
 * Temporary landing surface for the empty workspace. Replaced by the world
 * OverviewPage in M7 (docs/frontend/IMPLEMENTATION_PLAN.md).
 */
export function WorkspaceWelcome() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{appConfig.appName}</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          A workspace for building, understanding, and reasoning about fictional worlds.
        </p>
      </div>
      {appConfig.isDev ? (
        <Button asChild variant="outline" size="sm">
          <a href={appConfig.apiDocsUrl} target="_blank" rel="noreferrer">
            Backend API docs
          </a>
        </Button>
      ) : null}
    </div>
  )
}
