import type { ReactNode } from "react"

import { AiErrorSurface } from "@/features/ai/components/AiErrorSurface"
import { AiPendingSurface } from "@/features/ai/components/AiPendingSurface"
import type { AiRequest } from "@/features/ai/queries/useAiRequest"
import { cn } from "@/shared/lib/utils"

/**
 * The loading / error / result state machine, written once for all four
 * endpoints.
 *
 * This is the component that makes the four AI features behave identically
 * rather than merely look similar. Each surface differs only in what it renders
 * from a settled result and what it says while waiting; the *transitions* — when
 * a pulse appears, when a previous result dims instead of vanishing, what a
 * failure offers, what a cancel does — are decided here and cannot drift.
 *
 * The order of the branches is the specification:
 *
 *  1. **Failure** replaces everything, with a way forward. A cancel is not a
 *     failure and never reaches this branch (`useAiRequest` filters aborts out).
 *  2. **First run** shows the pulse: there is nothing yet to keep on screen.
 *  3. **Nothing asked yet** shows the caller's idle state.
 *  4. **A result, refreshing** stays readable and dims — the same
 *     stale-while-revalidate treatment `DataTable` uses for a background
 *     refetch. Never unmount a good answer to show a loader.
 *
 * "Empty" is deliberately not a branch. Whether a settled result counts as
 * empty is domain knowledge — a refusal with no citations is a *correct*
 * answer, while a retrieval over a world with no entities is genuinely empty —
 * so the render prop decides and returns its own `EmptyState`.
 */

interface AiStateRegionProps<TVars, TResult> {
  request: AiRequest<TVars, TResult>
  /** Present tense, plain: "Reading your world…". */
  pendingLabel: string
  /** Shown before the first run. */
  idle?: ReactNode
  /** A second way forward on failure, beyond "Try again". */
  errorAction?: ReactNode
  children: (result: TResult) => ReactNode
}

export function AiStateRegion<TVars, TResult>({
  request,
  pendingLabel,
  idle,
  errorAction,
  children,
}: AiStateRegionProps<TVars, TResult>) {
  const { error, result, isPending, lastVariables, run } = request

  if (error !== undefined) {
    return (
      <AiErrorSurface
        error={error}
        // Retry means "the same input again", which is only possible if we
        // still have it — and only worth offering for a transient failure.
        onRetry={
          lastVariables !== undefined && error.isRetryable ? () => run(lastVariables) : undefined
        }
        secondaryAction={errorAction}
      />
    )
  }

  if (result === undefined) {
    return isPending ? <AiPendingSurface label={pendingLabel} /> : <>{idle}</>
  }

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-4", isPending && "pointer-events-none opacity-60")}
    >
      {children(result)}
    </div>
  )
}
