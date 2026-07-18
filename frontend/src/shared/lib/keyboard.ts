/**
 * Shortcut parsing, matching, and display — one grammar for the whole app.
 *
 * A shortcut is written once, as a string, on the command that owns it
 * (`"mod+k"`, `"g c"`). This module is the only place that knows how to turn
 * that string into a keyboard match or into the chips a `Kbd` renders, so the
 * hotkey binding and the palette hint can never drift apart
 * (docs/frontend/FRONTEND_ARCHITECTURE.md §6).
 *
 * `mod` means Cmd on Apple platforms and Ctrl everywhere else.
 */

export type Shortcut = string

const APPLE_PLATFORM = /Mac|iPhone|iPad|iPod/i

export const isApplePlatform: boolean =
  typeof navigator !== "undefined" && APPLE_PLATFORM.test(navigator.platform || navigator.userAgent)

interface ParsedChord {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
}

/**
 * A shortcut is a space-separated *sequence* of chords; each chord is
 * `+`-separated modifiers plus one key. Most shortcuts are a single chord;
 * sequences support the `g c`-style leader shortcuts common in keyboard-first
 * tools.
 */
function parseChord(chord: string): ParsedChord {
  const parts = chord.toLowerCase().split("+")
  const key = parts.at(-1) ?? ""
  return {
    key,
    mod: parts.includes("mod"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
  }
}

export function parseShortcut(shortcut: Shortcut): ParsedChord[] {
  return shortcut.trim().split(/\s+/).map(parseChord)
}

/** Does this keyboard event satisfy the given chord? */
export function chordMatchesEvent(chord: ParsedChord, event: KeyboardEvent): boolean {
  const modPressed = isApplePlatform ? event.metaKey : event.ctrlKey
  if (chord.mod !== modPressed) return false
  if (chord.shift !== event.shiftKey) return false
  if (chord.alt !== event.altKey) return false
  return event.key.toLowerCase() === chord.key
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  escape: "Esc",
  enter: "↵",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  backspace: "⌫",
  " ": "Space",
}

/** Render a shortcut as the discrete key chips a `Kbd` displays. */
export function shortcutToKeys(shortcut: Shortcut): string[] {
  return parseShortcut(shortcut).flatMap((chord) => {
    const keys: string[] = []
    if (chord.mod) keys.push(isApplePlatform ? "⌘" : "Ctrl")
    if (chord.alt) keys.push(isApplePlatform ? "⌥" : "Alt")
    if (chord.shift) keys.push(isApplePlatform ? "⇧" : "Shift")
    keys.push(KEY_LABELS[chord.key] ?? chord.key.toUpperCase())
    return keys
  })
}

/**
 * True when a keystroke should be left to the focused control — typing "c" in a
 * search box must never trigger the "create" command.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}
