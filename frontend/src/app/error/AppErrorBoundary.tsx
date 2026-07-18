import { Component, type ErrorInfo, type ReactNode } from "react"

import { Button } from "@/shared/ui/button"

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  error: Error | null
}

/**
 * Top-level render-failure recovery (docs/frontend/COMPONENT_HIERARCHY.md §7).
 * Network/domain errors are handled by the query layer and never reach this
 * boundary; this catches genuine render bugs so the app fails visibly and
 * recoverably instead of white-screening.
 *
 * (A class component is required — React exposes error boundaries only
 * through the class lifecycle.)
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Foundation stage: log to the console. A reporting hook can be attached
    // here later without touching callers.
    console.error("Unrecoverable render error:", error, info.componentStack)
  }

  override render() {
    if (this.state.error === null) return this.props.children

    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background text-foreground">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          The workspace hit an unexpected error and could not recover on its own.
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload workspace
        </Button>
      </div>
    )
  }
}
