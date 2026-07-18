import { COMMAND_GROUPS, type CommandGroup, isCommandEnabled } from "@/shared/commands/registry"
import { useCommands } from "@/shared/commands/useCommand"
import { useUiStore } from "@/shared/store/ui-store"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup as CommandGroupUi,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/shared/ui/command"
import { KeyboardHint } from "@/shared/ui/composite/Kbd"

const GROUP_LABELS: Record<CommandGroup, string> = {
  navigation: "Go to",
  workspace: "Workspace",
  help: "Help",
}

/**
 * The ⌘K surface (docs/frontend/FRONTEND_ARCHITECTURE.md §6).
 *
 * It renders whatever the registry currently holds — it has no command list of
 * its own. That is what makes "register once, invoke three ways" true: a
 * feature that registers a command gets a palette entry with no palette change.
 *
 * In M7 this same surface gains cross-entity search results alongside commands.
 */
export function CommandPalette() {
  const open = useUiStore((state) => state.commandPaletteOpen)
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen)
  const commands = useCommands().filter(isCommandEnabled)

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search for a command or a destination."
      className="top-[18%] max-w-xl translate-y-0"
      showCloseButton={false}
    >
      <CommandInput placeholder="Search commands and destinations…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>
        {COMMAND_GROUPS.map((group, index) => {
          const groupCommands = commands.filter((command) => command.group === group)
          if (groupCommands.length === 0) return null

          return (
            <div key={group}>
              {index > 0 ? <CommandSeparator /> : null}
              <CommandGroupUi heading={GROUP_LABELS[group]}>
                {groupCommands.map((command) => {
                  const Icon = command.icon
                  return (
                    <CommandItem
                      key={command.id}
                      value={[command.label, ...(command.keywords ?? [])].join(" ")}
                      onSelect={() => {
                        // Close first so the palette never lingers over the
                        // surface the command just navigated to.
                        setOpen(false)
                        command.run()
                      }}
                    >
                      {Icon ? <Icon aria-hidden /> : null}
                      <span>{command.label}</span>
                      {command.shortcut ? (
                        <CommandShortcut>
                          <KeyboardHint shortcut={command.shortcut} />
                        </CommandShortcut>
                      ) : null}
                    </CommandItem>
                  )
                })}
              </CommandGroupUi>
            </div>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}
