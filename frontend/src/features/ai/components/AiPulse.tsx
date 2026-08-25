import { cn } from "@/shared/lib/utils"

/**
 * The AI presence indicator — the one thing that replaces a spinner in this app.
 *
 * Two soft radial gradients in the product accent, breathing out of phase
 * against the surface behind them. It is deliberately *indeterminate-looking*:
 * the backend does not stream and reports no progress, so anything that implied
 * a completion percentage would be a lie. Ambient attention is the honest
 * signal.
 *
 * **It never appears alone.** The meaning is carried by the label beside it —
 * this element is `aria-hidden`, and under `prefers-reduced-motion` it stops
 * moving entirely (see the keyframe comment in `styles/globals.css`). A user who
 * cannot see motion, or cannot see at all, must still be told what is happening,
 * so `AiPendingSurface` pairs the two and is the only thing that should mount
 * this directly.
 *
 * Unmount it when the request settles rather than hiding it: a paused animation
 * left in the tree holds a compositor layer for nothing.
 */

const SIZES = {
  /** Inline in a panel header or beside a button label. */
  sm: "size-3.5",
  /** Beside a prompt field. */
  md: "size-7",
  /** The centred, full-panel pending state. */
  lg: "size-14",
} as const

export type AiPulseSize = keyof typeof SIZES

interface AiPulseProps {
  size?: AiPulseSize
  className?: string
}

export function AiPulse({ size = "md", className }: AiPulseProps) {
  return (
    <span
      aria-hidden
      data-slot="ai-pulse"
      className={cn("relative inline-block shrink-0", SIZES[size], className)}
    >
      {/* Halo first: the wider, dimmer layer sits behind the core. */}
      <span className="absolute inset-0 ai-pulse-halo rounded-full" />
      <span className="absolute inset-0 ai-pulse-core rounded-full" />
    </span>
  )
}
