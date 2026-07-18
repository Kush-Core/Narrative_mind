import { PanelLeftIcon, PanelRightIcon, SearchIcon } from "lucide-react"

import { Breadcrumbs } from "@/app/shell/Breadcrumbs"
import { cn } from "@/shared/lib/utils"
import { useUiStore } from "@/shared/store/ui-store"
import { Button } from "@/shared/ui/button"
import { KeyboardHint } from "@/shared/ui/composite/Kbd"
import { Separator } from "@/shared/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"

interface CommandBarProps {
  /** Hidden when the viewport is too narrow to host the inspector at all. */
  auxPanelAvailable: boolean
}

/**
 * The top of the workspace: identity, where you are, how to get anywhere, and
 * the panel toggles (docs/frontend/COMPONENT_HIERARCHY.md §7).
 *
 * The search control is a *trigger*, not an input. Search lives in the command
 * palette so there is one search surface reachable three ways — click, ⌘K, or
 * the palette itself — rather than a second search box competing with it.
 */
export function CommandBar({ auxPanelAvailable }: CommandBarProps) {
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleAuxPanel = useUiStore((state) => state.toggleAuxPanel)
  const auxPanelOpen = useUiStore((state) => state.auxPanelOpen)
  const openPalette = useUiStore((state) => state.setCommandPaletteOpen)

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b bg-chrome px-2.5 shadow-panel">
      <div className="flex shrink-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Expand explorer" : "Collapse explorer"}
              aria-expanded={!sidebarCollapsed}
            >
              <PanelLeftIcon aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle explorer</TooltipContent>
        </Tooltip>

        <span className="text-sm font-semibold tracking-tight text-foreground select-none">
          Narrative Mind
        </span>
      </div>

      <Separator orientation="vertical" className="h-4! shrink-0" />

      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => openPalette(true)}
        className="w-56 justify-start gap-2 text-muted-foreground max-lg:w-auto max-lg:justify-center"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <SearchIcon aria-hidden />
        <span className="max-lg:sr-only">Search the world</span>
        <KeyboardHint shortcut="mod+k" className="ml-auto max-lg:hidden" />
      </Button>

      {auxPanelAvailable ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleAuxPanel}
              aria-label={auxPanelOpen ? "Hide inspector" : "Show inspector"}
              aria-expanded={auxPanelOpen}
              className={cn(auxPanelOpen && "bg-accent text-accent-foreground")}
            >
              <PanelRightIcon aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle inspector</TooltipContent>
        </Tooltip>
      ) : null}
    </header>
  )
}
