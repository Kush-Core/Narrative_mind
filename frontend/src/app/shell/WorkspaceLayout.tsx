import { useEffect } from "react"
import type { Layout, LayoutChangedMeta } from "react-resizable-panels"
import { Outlet, useLocation } from "react-router-dom"

import { CommandProvider } from "@/app/providers/command-provider"
import { AskDockOverlay, AskDockPanel } from "@/app/shell/AskDockHost"
import { CommandBar } from "@/app/shell/CommandBar"
import { ExplorerSidebar } from "@/app/shell/ExplorerSidebar"
import { StatusBar } from "@/app/shell/StatusBar"
import { paths } from "@/routes/paths"
import { BREAKPOINT, useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { resolvePanelLayout, useUiStore } from "@/shared/store/ui-store"
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
 * below `lg` the explorer drops to its icon rail and the Ask dock becomes an
 * overlay rather than a third column. The workspace stays itself at every width
 * rather than becoming a different, phone-shaped product.
 */

/** Panel ids double as the keys of the persisted layout map. */
const PANEL_ID = { explorer: "explorer", main: "main", aux: "aux" } as const

export function WorkspaceLayout() {
  const compact = useMediaQuery(BREAKPOINT.compact)
  const { pathname } = useLocation()

  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed)
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed)
  const panelSizes = useUiStore((state) => state.panelSizes)
  const setPanelSizes = useUiStore((state) => state.setPanelSizes)
  const askDockOpen = useUiStore((state) => state.askDockOpen)
  const setAskDockOpen = useUiStore((state) => state.setAskDockOpen)

  // A compact viewport forces the rail; the user's own preference is restored
  // by the store as soon as there is room for the full explorer again.
  useEffect(() => {
    if (compact) setSidebarCollapsed(true)
  }, [compact, setSidebarCollapsed])

  const showExplorerPanel = !sidebarCollapsed
  // The `/ask` route already *is* the panel the dock would show — rendering it
  // a second time would duplicate the whole surface, not just waste space. This
  // is checked here rather than only in the command that opens it, because
  // `askDockOpen` persists: a user who opened the dock elsewhere and then
  // navigated to `/ask` by a sidebar link, not ⌘I, would otherwise still see it
  // twice. Closing the state on arrival, rather than merely hiding the render,
  // keeps the persisted flag honest — reopening the dock from another screen
  // still reflects the choice the user actually made.
  const dockRedundant = pathname === paths.ai.ask()
  useEffect(() => {
    if (dockRedundant && askDockOpen) setAskDockOpen(false)
  }, [dockRedundant, askDockOpen, setAskDockOpen])
  const effectiveDockOpen = askDockOpen && !dockRedundant
  // Below `lg` there is no width to divide three ways, so the dock leaves the
  // panel group entirely and becomes an overlay.
  const showDockPanel = effectiveDockOpen && !compact

  function handleLayoutChanged(layout: Layout, meta: LayoutChangedMeta) {
    // Only a real drag or keyboard resize should overwrite the stored geometry;
    // remounts and constraint recomputes must not rewrite the user's layout.
    if (!meta.isUserInteraction) return

    // Only the panels actually rendered report a size; the store merges, so an
    // arrangement without the dock does not overwrite the dock's width.
    setPanelSizes({
      explorer: layout[PANEL_ID.explorer],
      main: layout[PANEL_ID.main],
      aux: layout[PANEL_ID.aux],
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
            key={`${showExplorerPanel}-${showDockPanel}`}
            orientation="horizontal"
            className="min-h-0 flex-1"
            defaultLayout={resolvePanelLayout(panelSizes, {
              explorer: showExplorerPanel,
              aux: showDockPanel,
            })}
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

            {showDockPanel ? (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel
                  id={PANEL_ID.aux}
                  defaultSize={`${panelSizes.aux}`}
                  minSize="18"
                  maxSize="45"
                >
                  <AskDockPanel onClose={() => setAskDockOpen(false)} />
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        </div>

        <AskDockOverlay open={effectiveDockOpen && compact} onOpenChange={setAskDockOpen} />

        <StatusBar />
      </div>
    </CommandProvider>
  )
}
