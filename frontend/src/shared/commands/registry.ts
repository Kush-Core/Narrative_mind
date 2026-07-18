/**
 * The command registry (docs/frontend/FRONTEND_ARCHITECTURE.md §6, D10).
 *
 * One registration, three affordances: a command registered here is invokable
 * from the command palette, from its keyboard shortcut, and from any menu that
 * chooses to render it. Behaviour lives in exactly one place, so a shortcut and
 * a palette entry can never disagree about what an action does.
 *
 * Deliberately in-house and framework-agnostic: it is a subscribable map, small
 * enough to read in one sitting, with no dependency beyond React's
 * `useSyncExternalStore` at the consumption edge (`useCommand.ts`).
 */

import type { LucideIcon } from "lucide-react"

import type { Shortcut } from "@/shared/lib/keyboard"

/** Palette grouping. Ordered as declared here. */
export const COMMAND_GROUPS = ["navigation", "workspace", "help"] as const

export type CommandGroup = (typeof COMMAND_GROUPS)[number]

export interface Command {
  /** Stable, unique, greppable — e.g. `navigate.characters`. */
  id: string
  label: string
  group: CommandGroup
  run: () => void
  icon?: LucideIcon
  shortcut?: Shortcut
  /** Extra terms the palette should match on beyond the label. */
  keywords?: string[]
  /** Hidden from the palette while false; the shortcut is inert too. */
  enabled?: boolean
}

type Listener = () => void

const commands = new Map<string, Command>()
const listeners = new Set<Listener>()

/** Recomputed on write so `getSnapshot` can return a stable reference. */
let snapshot: readonly Command[] = []

function publish() {
  const groupOrder = new Map(COMMAND_GROUPS.map((group, index) => [group, index]))
  snapshot = [...commands.values()].sort(
    (a, b) => (groupOrder.get(a.group) ?? 0) - (groupOrder.get(b.group) ?? 0),
  )
  for (const listener of listeners) listener()
}

publish()

/**
 * Members are arrow properties, not methods, so they can be passed directly to
 * `useSyncExternalStore` without losing their binding.
 */
export const commandRegistry = {
  /**
   * Register commands and return a disposer. Registration is *owned* by whoever
   * mounts it, so commands for a screen disappear when that screen unmounts.
   */
  register: (...toRegister: Command[]): (() => void) => {
    for (const command of toRegister) commands.set(command.id, command)
    publish()

    return () => {
      for (const command of toRegister) {
        // Guard against a re-registration having replaced this entry already.
        if (commands.get(command.id) === command) commands.delete(command.id)
      }
      publish()
    }
  },

  get: (id: string): Command | undefined => commands.get(id),

  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  getSnapshot: (): readonly Command[] => snapshot,
}

/** A command is runnable unless it explicitly opted out. */
export function isCommandEnabled(command: Command): boolean {
  return command.enabled !== false
}
