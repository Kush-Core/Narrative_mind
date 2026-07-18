/**
 * React bindings for the command registry.
 *
 * `useRegisterCommands` mounts commands for the lifetime of a component;
 * `useCommands` reads the live set; `useCommandHotkeys` binds every registered
 * shortcut once, at the app root. Nothing else in the app attaches a global
 * `keydown` listener.
 */

import { useEffect, useSyncExternalStore } from "react"

import { type Command, commandRegistry, isCommandEnabled } from "@/shared/commands/registry"
import { chordMatchesEvent, isTypingTarget, parseShortcut } from "@/shared/lib/keyboard"

/** The live, ordered set of registered commands. */
export function useCommands(): readonly Command[] {
  return useSyncExternalStore(commandRegistry.subscribe, commandRegistry.getSnapshot)
}

/**
 * Register commands for as long as the calling component is mounted.
 *
 * `commands` must be referentially stable across renders that do not change it
 * (wrap it in `useMemo`), otherwise the registry churns on every render.
 */
export function useRegisterCommands(commands: Command[]): void {
  useEffect(() => commandRegistry.register(...commands), [commands])
}

/**
 * Bind all registered shortcuts. Mounted exactly once, by the command provider.
 *
 * Two rules keep this from fighting the rest of the app:
 *  - keystrokes aimed at a text field are left alone, *unless* the shortcut
 *    uses a modifier (Cmd-K must work from inside the search box);
 *  - sequence shortcuts ("g c") accumulate within a short window and reset on
 *    any non-matching key.
 */
const SEQUENCE_TIMEOUT_MS = 1200

export function useCommandHotkeys(): void {
  const commands = useCommands()

  useEffect(() => {
    let pending: string[] = []
    let resetTimer: number | undefined

    function resetSequence() {
      pending = []
      window.clearTimeout(resetTimer)
      resetTimer = undefined
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return

      const typing = isTypingTarget(event.target)
      const candidate = [...pending, event.key.toLowerCase()]

      for (const command of commands) {
        if (!command.shortcut || !isCommandEnabled(command)) continue

        const chords = parseShortcut(command.shortcut)
        const usesModifier = chords.some((chord) => chord.mod || chord.alt)
        if (typing && !usesModifier) continue
        if (chords.length !== candidate.length) continue

        // Earlier chords were matched on previous keystrokes; only the final
        // chord is checked against the live event.
        const prefixMatches = chords
          .slice(0, -1)
          .every((chord, index) => chord.key === candidate[index])
        const lastChord = chords.at(-1)
        if (!prefixMatches || !lastChord || !chordMatchesEvent(lastChord, event)) continue

        event.preventDefault()
        resetSequence()
        command.run()
        return
      }

      // No command fired. Keep the keystroke only if it could still begin a
      // longer sequence; a bare modifier press is ignored outright.
      const couldStartSequence = commands.some((command) => {
        if (!command.shortcut || !isCommandEnabled(command)) return false
        const chords = parseShortcut(command.shortcut)
        return (
          chords.length > candidate.length &&
          chords.slice(0, candidate.length).every((chord, index) => chord.key === candidate[index])
        )
      })

      if (couldStartSequence && !typing) {
        pending = candidate
        window.clearTimeout(resetTimer)
        resetTimer = window.setTimeout(resetSequence, SEQUENCE_TIMEOUT_MS)
      } else {
        resetSequence()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.clearTimeout(resetTimer)
    }
  }, [commands])
}
