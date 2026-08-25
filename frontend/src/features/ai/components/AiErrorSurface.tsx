import type { ReactNode } from "react"

import type { ApiError } from "@/shared/api/api-error"
import { toUserMessage, toUserTitle } from "@/shared/api/error-presentation"
import { Button } from "@/shared/ui/button"
import { ErrorState } from "@/shared/ui/composite/ErrorState"

/**
 * How every AI failure is reported.
 *
 * Built on `ErrorState` so tone, icon, and layout are inherited rather than
 * re-decided — an AI failure should look like any other failure in the app,
 * because it is one. The title and message come from `error-presentation.ts`,
 * which already knows that a backend domain message is written for humans and a
 * transport failure's is not.
 *
 * **Inline, never a toast.** The AI mutations set
 * `meta: { suppressErrorToast: true }`, so the shared mutation-error toast stays
 * out of the way and the failure lands in the panel the user is looking at.
 * A toast would put the message somewhere other than where the user's attention
 * already is, and take it away again after a few seconds.
 *
 * A cancelled request never reaches here: `useAiRequest` filters aborts out of
 * `error` entirely, because stopping something on purpose is not a failure.
 */

interface AiErrorSurfaceProps {
  error: ApiError
  /** Re-runs the same input. Offered whenever the operation is repeatable. */
  onRetry?: () => void
  /**
   * A second way forward, for failures where one exists — chiefly
   * `provider_unavailable`, where retrieval still works even though generation
   * does not.
   */
  secondaryAction?: ReactNode
}

export function AiErrorSurface({ error, onRetry, secondaryAction }: AiErrorSurfaceProps) {
  const retry =
    onRetry !== undefined ? (
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    ) : null

  return (
    <ErrorState
      title={toUserTitle(error)}
      description={toUserMessage(error)}
      // `ErrorState` renders either its own retry button or a caller action, not
      // both — so when there is a second way forward, both are composed here.
      action={
        secondaryAction !== undefined ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {retry}
            {secondaryAction}
          </div>
        ) : undefined
      }
      onRetry={secondaryAction === undefined ? onRetry : undefined}
    />
  )
}
