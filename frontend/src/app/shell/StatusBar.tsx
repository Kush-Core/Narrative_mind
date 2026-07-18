import { CircleDotIcon } from "lucide-react"

import { appConfig } from "@/shared/config/env"
import { cn } from "@/shared/lib/utils"
import { useUiStore } from "@/shared/store/ui-store"
import { Button } from "@/shared/ui/button"
import { Separator } from "@/shared/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"

/**
 * Ambient system truth along the bottom edge (docs/frontend/COMPONENT_HIERARCHY.md §7).
 *
 * The connection indicator is **presentational only** at this stage: the shell
 * milestone performs no network requests, so it reports `unknown` rather than
 * inventing a status. Wiring `GET /health` into `status` is the entire change
 * needed later — the display contract below does not move.
 */
export type ConnectionStatus = "unknown" | "connected" | "degraded" | "offline"

const STATUS_PRESENTATION: Record<ConnectionStatus, { label: string; className: string }> = {
  unknown: { label: "Not connected", className: "text-muted-foreground" },
  connected: { label: "Connected", className: "text-success" },
  degraded: { label: "Degraded", className: "text-warning" },
  offline: { label: "Offline", className: "text-destructive" },
}

interface StatusBarProps {
  status?: ConnectionStatus
}

export function StatusBar({ status = "unknown" }: StatusBarProps) {
  const resetLayout = useUiStore((state) => state.resetLayout)
  const presentation = STATUS_PRESENTATION[status]

  return (
    <footer className="flex h-7 shrink-0 items-center gap-2 border-t bg-chrome px-2.5 text-2xs text-chrome-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("flex items-center gap-1.5", presentation.className)}>
            <CircleDotIcon className="size-3" aria-hidden />
            <span>{presentation.label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">Backend at {appConfig.apiHost}</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-3!" />
      <span>{appConfig.mode}</span>

      <span className="flex-1" />

      <Button
        variant="ghost"
        size="xs"
        onClick={resetLayout}
        className="text-2xs text-chrome-foreground hover:text-foreground"
      >
        Reset layout
      </Button>
    </footer>
  )
}
