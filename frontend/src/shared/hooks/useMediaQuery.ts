import { useSyncExternalStore } from "react"

/**
 * Subscribe to a CSS media query from React.
 *
 * The workspace is desktop-first: layout decisions are made in CSS wherever
 * possible, and this hook is reserved for the cases where the *structure* must
 * change — a panel that becomes an overlay rather than merely narrowing, which
 * CSS alone cannot express.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    // Server snapshot: no match. The app is client-rendered; this keeps the
    // hook safe if that ever changes.
    () => false,
  )
}

/** Breakpoints the shell reacts to, aligned with Tailwind's scale. */
export const BREAKPOINT = {
  /** Below this the explorer becomes an overlay instead of a fixed panel. */
  compact: "(max-width: 1023px)",
  /** Below this the auxiliary inspector panel is not offered at all. */
  narrow: "(max-width: 1279px)",
} as const
