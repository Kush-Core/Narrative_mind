import { Outlet } from "react-router-dom"

import { CommandBar } from "@/app/shell/CommandBar"
import { ExplorerSidebar } from "@/app/shell/ExplorerSidebar"
import { StatusBar } from "@/app/shell/StatusBar"

/**
 * The persistent desktop chrome: command bar on top, explorer beside the main
 * work surface, status bar below. Routes render into the main surface via
 * <Outlet/>. M1 upgrades the static split to resizable panels
 * (docs/frontend/COMPONENT_HIERARCHY.md §7).
 */
export function WorkspaceLayout() {
  return (
    <div className="grid h-dvh grid-rows-[auto_1fr_auto] bg-background text-foreground">
      <CommandBar />
      <div className="flex min-h-0">
        <ExplorerSidebar />
        <main className="min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
