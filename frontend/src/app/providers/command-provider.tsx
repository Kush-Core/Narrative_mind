import { PanelLeftIcon, RotateCcwIcon, SearchIcon } from "lucide-react"
import { type ReactNode, useMemo } from "react"
import { useNavigate } from "react-router-dom"

import { CommandPalette } from "@/app/shell/CommandPalette"
import { navItems } from "@/app/shell/navigation"
import type { Command } from "@/shared/commands/registry"
import { useCommandHotkeys, useRegisterCommands } from "@/shared/commands/useCommand"
import { useUiStore } from "@/shared/store/ui-store"

/**
 * Hosts the keyboard-first spine: registers the shell's own commands, binds
 * every registered shortcut once, and mounts the palette
 * (docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.1).
 *
 * Navigation commands are *derived from the navigation model*, so a destination
 * added to `navigation.ts` becomes keyboard- and palette-reachable with no code
 * written here. Feature slices register their own commands from their own
 * components via `useRegisterCommands`.
 */
export function CommandProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const togglePalette = useUiStore((state) => state.toggleCommandPalette)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const resetLayout = useUiStore((state) => state.resetLayout)

  const commands = useMemo<Command[]>(
    () => [
      ...navItems.map((item) => ({
        id: `navigate.${item.id}`,
        label: item.label,
        group: "navigation" as const,
        icon: item.icon,
        shortcut: item.shortcut,
        keywords: ["go to", "open", item.label],
        run: () => navigate(item.path),
      })),
      {
        id: "workspace.search",
        label: "Search the world",
        group: "workspace",
        icon: SearchIcon,
        shortcut: "mod+k",
        keywords: ["find", "command palette"],
        run: togglePalette,
      },
      {
        id: "workspace.toggle-explorer",
        label: "Toggle explorer",
        group: "workspace",
        icon: PanelLeftIcon,
        shortcut: "mod+b",
        keywords: ["sidebar", "navigator"],
        run: toggleSidebar,
      },
      {
        id: "workspace.reset-layout",
        label: "Reset layout",
        group: "workspace",
        icon: RotateCcwIcon,
        keywords: ["panels", "default"],
        run: resetLayout,
      },
    ],
    [navigate, togglePalette, toggleSidebar, resetLayout],
  )

  useRegisterCommands(commands)
  useCommandHotkeys()

  return (
    <>
      {children}
      <CommandPalette />
    </>
  )
}
