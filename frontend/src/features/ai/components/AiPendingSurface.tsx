import { AiPulse } from "@/features/ai/components/AiPulse"
import { cn } from "@/shared/lib/utils"

/**
 * What an AI surface shows while it is thinking and has nothing yet.
 *
 * Deliberately **not** `LoadingState`. Skeletons promise the shape of what is
 * coming, and they are right for an entity list — the rows are already known.
 * The shape of an answer is not known until it arrives, so a skeleton would be
 * making something up. The pulse says "working" and claims nothing else, which
 * is all the backend actually tells us: there is no streaming and no progress.
 *
 * **The label is not decoration and not a reduced-motion fallback.** It is
 * always visible, for three reasons: the pulse is `aria-hidden` and carries no
 * meaning to a screen reader; the global `prefers-reduced-motion` rule freezes
 * the pulse entirely; and a glow plus two quiet words is simply calmer than a
 * glow alone. The `role="status"` live region is what announces it.
 *
 * There is no cancel control here. Stopping is the submit button's job — it
 * swaps its label rather than a second control appearing — so that an AI
 * surface never changes its control count between states.
 */

interface AiPendingSurfaceProps {
  /** Present tense, plain: "Reading your world…". */
  label: string
  className?: string
}

export function AiPendingSurface({ label, className }: AiPendingSurfaceProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex min-h-40 w-full flex-col items-center justify-center gap-4 px-8 py-10",
        className,
      )}
    >
      <AiPulse size="lg" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
