import { useEffect } from "react"
import type { Layout, LayoutChangedMeta } from "react-resizable-panels"
import { Outlet } from "react-router-dom"

import { CommandProvider } from "@/app/providers/command-provider"
import { CommandBar } from "@/app/shell/CommandBar"
import { ExplorerSidebar } from "@/app/shell/ExplorerSidebar"
import { StatusBar } from "@/app/shell/StatusBar"
import { BREAKPOINT, useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { DEFAULT_PANEL_SIZES, useUiStore } from "@/shared/store/ui-store"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/shared/ui/resizable"

/**
 * The persistent desktop chrome (docs/frontend/COMPONENT_HIERARCHY.md §7):
 * command bar on top, a resizable explorer | main split in the middle, status
 * bar below, palette over everything.
 *
 * It owns the workspace regions and their geometry, and knows nothing about
 * what renders inside them — routes arrive through `<Outlet/>`. Panel sizes
 * persist through the UI store, so the workspace reopens as it was left.
 *
 * **Responsive behaviour is desktop-first and structural, not adaptive-mobile:**
 * below `lg` the explorer drops to its icon rail. The workspace stays itself at
 * every width rather than becoming a different, phone-shaped product.
 */

/** Panel ids double as the keys of the persisted layout map. */
const PANEL_ID = { explorer: "explorer", main: "main" } as const

export function WorkspaceLayout() {
  const compact = useMediaQuery(BREAKPOINT.compact)

  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed)
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed)
  const panelSizes = useUiStore((state) => state.panelSizes)
  const setPanelSizes = useUiStore((state) => state.setPanelSizes)

  // A compact viewport forces the rail; the user's own preference is restored
  // by the store as soon as there is room for the full explorer again.
  useEffect(() => {
    if (compact) setSidebarCollapsed(true)
  }, [compact, setSidebarCollapsed])

  const showExplorerPanel = !sidebarCollapsed

  function handleLayoutChanged(layout: Layout, meta: LayoutChangedMeta) {
    // Only a real drag or keyboard resize should overwrite the stored geometry;
    // remounts and constraint recomputes must not rewrite the user's layout.
    if (!meta.isUserInteraction) return

    const explorer = layout[PANEL_ID.explorer]
    const main = layout[PANEL_ID.main]
    setPanelSizes({
      explorer: explorer ?? panelSizes.explorer,
      main: main ?? panelSizes.main,
    })
  }

  return (
    <CommandProvider>
      <div className="grid h-dvh grid-rows-[auto_1fr_auto] overflow-hidden bg-background text-foreground">
        <CommandBar />

        {/* `min-w-0` alongside `min-h-0`: as a grid item this row defaults to
            `min-width: auto`, so it sized to the panel group's min-content —
            about 1100px — and the grid's `overflow-hidden` silently clipped the
            excess. Every screen's right-hand controls were unreachable below
            roughly 1100px. */}
        <div className="flex min-h-0 min-w-0">
          {/* Collapsed, the explorer is a fixed icon rail rather than a
              resizable panel — a rail has no width worth dragging. */}
          {showExplorerPanel ? null : (
            <div className="w-12 shrink-0 border-r">
              <ExplorerSidebar />
            </div>
          )}

          <ResizablePanelGroup
            // Remounting on structural change lets each arrangement start from
            // the stored sizes instead of inheriting the previous one's.
            key={`${showExplorerPanel}`}
            orientation="horizontal"
            className="min-h-0 flex-1"
            defaultLayout={{ ...DEFAULT_PANEL_SIZES, ...panelSizes }}
            onLayoutChanged={handleLayoutChanged}
          >
            {showExplorerPanel ? (
              <>
                <ResizablePanel
                  id={PANEL_ID.explorer}
                  defaultSize={`${panelSizes.explorer}`}
                  minSize="12"
                  maxSize="30"
                >
                  <ExplorerSidebar />
                </ResizablePanel>
                <ResizableHandle withHandle />
              </>
            ) : null}

            <ResizablePanel id={PANEL_ID.main} minSize="30">
              <main className="h-full min-w-0 overflow-auto" tabIndex={-1}>
                <Outlet />
              </main>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <StatusBar />
      </div>
    </CommandProvider>
  )
}
