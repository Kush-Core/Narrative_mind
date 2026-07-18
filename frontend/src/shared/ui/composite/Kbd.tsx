import { shortcutToKeys } from "@/shared/lib/keyboard"
import { cn } from "@/shared/lib/utils"

/**
 * Shortcut chips (docs/frontend/COMPONENT_HIERARCHY.md §4). Keyboard-first is a
 * product principle, so shortcuts are *shown*, not hidden in documentation.
 *
 * `Kbd` renders explicit keys; `KeyboardHint` renders a shortcut string through
 * the shared grammar in `shared/lib/keyboard.ts`, so the chip and the binding
 * are always the same thing.
 */

interface KbdProps {
  keys: string[]
  className?: string
}

export function Kbd({ keys, className }: KbdProps) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {/* Keyed by position: a sequence shortcut may legitimately repeat a key
          (for example "g g"), so the key itself is not unique. */}
      {keys.map((key, index) => (
        <kbd
          key={`${index}-${key}`}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border/80 bg-muted px-1 font-sans text-2xs leading-none font-medium text-muted-foreground"
        >
          {key}
        </kbd>
      ))}
    </span>
  )
}

interface KeyboardHintProps {
  shortcut: string
  className?: string
}

export function KeyboardHint({ shortcut, className }: KeyboardHintProps) {
  return <Kbd keys={shortcutToKeys(shortcut)} className={className} />
}
