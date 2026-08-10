import { CircleDotIcon } from "lucide-react"

import { type ConnectionStatus, useHealthQuery } from "@/features/system"
import { useSessionStore } from "@/shared/auth/session-store"
import { appConfig } from "@/shared/config/env"
import { cn } from "@/shared/lib/utils"
import { useUiStore } from "@/shared/store/ui-store"
import { Button } from "@/shared/ui/button"
import { Separator } from "@/shared/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"

/**
 * Ambient system truth along the bottom edge (docs/frontend/COMPONENT_HIERARCHY.md §7).
 *
 * The connection indicator is driven by the polled `/health` query. The shell
 * stays presentational: it reads a derived status and renders it, while the
 * polling, retry, and error semantics belong to the `system` slice.
 *
 * Also reports the *backend's* environment once known, which is the more useful
 * fact than the client's build mode when the two disagree.
 */

const STATUS_PRESENTATION: Record<
  ConnectionStatus,
  { label: string; className: string; hint: string }
> = {
  unknown: {
    label: "Connecting…",
    className: "text-muted-foreground",
    hint: "Checking whether the backend is reachable",
  },
  connected: {
    label: "Connected",
    className: "text-success",
    hint: "The backend is reachable and healthy",
  },
  degraded: {
    label: "Degraded",
    className: "text-warning",
    hint: "The backend answered, but reported a problem",
  },
  offline: {
    label: "Offline",
    className: "text-destructive",
    hint: "The backend could not be reached",
  },
}

export function StatusBar() {
  const resetLayout = useUiStore((state) => state.resetLayout)
  const clearSession = useSessionStore((state) => state.clearSession)
  const { status, data, isFetching, refetch } = useHealthQuery()

  const presentation = STATUS_PRESENTATION[status]
  const environment = data?.environment ?? appConfig.mode
  const canRetry = status === "offline" || status === "degraded"

  return (
    <footer className="flex h-7 shrink-0 items-center gap-2 border-t bg-chrome px-2.5 text-2xs text-chrome-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="status"
            aria-live="polite"
            className={cn("flex items-center gap-1.5", presentation.className)}
          >
            <CircleDotIcon className={cn("size-3", isFetching && "animate-pulse")} aria-hidden />
            <span>{presentation.label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {presentation.hint} · {appConfig.apiHost}
        </TooltipContent>
      </Tooltip>

      {canRetry ? (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => void refetch()}
          className="h-4 px-1 text-2xs text-chrome-foreground hover:text-foreground"
        >
          Retry
        </Button>
      ) : null}

      <Separator orientation="vertical" className="h-3!" />
      <span>{environment}</span>

      <span className="flex-1" />

      <Button
        variant="ghost"
        size="xs"
        onClick={resetLayout}
        className="text-2xs text-chrome-foreground hover:text-foreground"
      >
        Reset layout
      </Button>

      <Separator orientation="vertical" className="h-3!" />

      <Button
        variant="ghost"
        size="xs"
        onClick={() => clearSession()}
        className="text-2xs text-chrome-foreground hover:text-foreground"
      >
        Sign out
      </Button>
    </footer>
  )
}
