import { useEffect } from "react"
import type { Layout, LayoutChangedMeta } from "react-resizable-panels"
import { Outlet } from "react-router-dom"

import { CommandProvider } from "@/app/providers/command-provider"
import { AuxPanel } from "@/app/shell/AuxPanel"
import { CommandBar } from "@/app/shell/CommandBar"
import { ExplorerSidebar } from "@/app/shell/ExplorerSidebar"
import { StatusBar } from "@/app/shell/StatusBar"
import { BREAKPOINT, useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { DEFAULT_PANEL_SIZES, useUiStore } from "@/shared/store/ui-store"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/shared/ui/resizable"

/**
 * The persistent desktop chrome (docs/frontend/COMPONENT_HIERARCHY.md §7):
 * command bar on top, a resizable explorer | main | inspector split in the
 * middle, status bar below, palette over everything.
 *
 * It owns the workspace regions and their geometry, and knows nothing about
 * what renders inside them — routes arrive through `<Outlet/>`. Panel sizes
 * persist through the UI store, so the workspace reopens as it was left.
 *
 * **Responsive behaviour is desktop-first and structural, not adaptive-mobile:**
 * below `xl` the inspector is not offered (a three-way split stops being useful),
 * and below `lg` the explorer drops to its icon rail. The workspace stays itself
 * at every width rather than becoming a different, phone-shaped product.
 */

/** Panel ids double as the keys of the persisted layout map. */
const PANEL_ID = { explorer: "explorer", main: "main", aux: "aux" } as const

export function WorkspaceLayout() {
  const compact = useMediaQuery(BREAKPOINT.compact)
  const narrow = useMediaQuery(BREAKPOINT.narrow)

  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed)
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed)
  const auxPanelOpen = useUiStore((state) => state.auxPanelOpen)
  const panelSizes = useUiStore((state) => state.panelSizes)
  const setPanelSizes = useUiStore((state) => state.setPanelSizes)

  // A compact viewport forces the rail; the user's own preference is restored
  // by the store as soon as there is room for the full explorer again.
  useEffect(() => {
    if (compact) setSidebarCollapsed(true)
  }, [compact, setSidebarCollapsed])

  const showAuxPanel = auxPanelOpen && !narrow
  const showExplorerPanel = !sidebarCollapsed

  function handleLayoutChanged(layout: Layout, meta: LayoutChangedMeta) {
    // Only a real drag or keyboard resize should overwrite the stored geometry;
    // remounts and constraint recomputes must not rewrite the user's layout.
    if (!meta.isUserInteraction) return

    const explorer = layout[PANEL_ID.explorer]
    const main = layout[PANEL_ID.main]
    const aux = layout[PANEL_ID.aux]
    setPanelSizes({
      explorer: explorer ?? panelSizes.explorer,
      main: main ?? panelSizes.main,
      aux: aux ?? panelSizes.aux,
    })
  }

  return (
    <CommandProvider>
      <div className="grid h-dvh grid-rows-[auto_1fr_auto] overflow-hidden bg-background text-foreground">
        <CommandBar auxPanelAvailable={!narrow} />

        <div className="flex min-h-0">
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
            key={`${showExplorerPanel}-${showAuxPanel}`}
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

            {showAuxPanel ? (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel
                  id={PANEL_ID.aux}
                  defaultSize={`${panelSizes.aux}`}
                  minSize="16"
                  maxSize="40"
                >
                  <AuxPanel />
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        </div>

        <StatusBar />
      </div>
    </CommandProvider>
  )
}
