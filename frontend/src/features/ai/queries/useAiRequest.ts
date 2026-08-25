/**
 * The one request primitive every AI surface is built on.
 *
 * All four `/ai/*` endpoints are user-triggered POSTs whose results are **not
 * server state**: an answer is not a cached resource, and re-asking must
 * genuinely re-ask. So they are mutations, and the AI slice holds no query
 * keys, no cache entries, and no invalidation — there is nothing there to get
 * out of sync. Routing all four through this hook is what makes "how an AI
 * request behaves" a single decision rather than four.
 *
 * What it adds on top of `useMutation`:
 *
 *  - **Cancellation.** `useMutation` does not hand `mutationFn` an `AbortSignal`
 *    the way `useQuery` does, so the controller is owned here. The signal
 *    reaches the HTTP client, which combines it with the request deadline via
 *    `AbortSignal.any` — whichever fires first wins.
 *  - **A cancel is not a failure.** An aborted request is filtered out of
 *    `error` entirely, so the surface returns to what it was showing before
 *    rather than reporting something the user did on purpose. This is the same
 *    policy `error-presentation.ts` already applies to canceled reads
 *    (presentation `"silent"`); it is enforced here because a mutation has no
 *    equivalent path.
 *  - **The last good result survives a cancel.** TanStack clears `data` when a
 *    mutation settles in error — including an abort — so the successful result
 *    is held in state here instead. Without this, cancelling a *re-run* would
 *    throw away the answer already on screen.
 */

import { useMutation } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import type { ApiError } from "@/shared/api/api-error"
import { isAbortError } from "@/shared/api/api-error"
import { toApiError } from "@/shared/api/error-presentation"

export interface AiRequestOptions<TResult> {
  /**
   * Called once, when a request succeeds.
   *
   * Exists so a caller can act on a result without an effect. Synchronising
   * "apply this to a form field" through `useEffect` means depending on a
   * callback prop whose identity changes every render, which re-applies the
   * value on top of whatever the user has typed since. A callback at the point
   * of success has no such hazard. Never fires for a cancelled request.
   */
  onSuccess?: (result: TResult) => void
}

export interface AiRequest<TVars, TResult> {
  /** Fire the request, cancelling any still in flight. */
  run: (variables: TVars) => void
  /** Abort the in-flight request. Silent — not an error. */
  cancel: () => void
  /** Clear the result and any error, returning to the initial state. */
  reset: () => void
  isPending: boolean
  /** The last successful result. Survives a cancel; cleared by `reset`. */
  result: TResult | undefined
  /** A genuine failure. Never set for a cancellation. */
  error: ApiError | undefined
  /** The variables of the most recent run — the input a retry should reuse. */
  lastVariables: TVars | undefined
}

export function useAiRequest<TVars, TResult>(
  request: (variables: TVars, options: { signal: AbortSignal }) => Promise<TResult>,
  options: AiRequestOptions<TResult> = {},
): AiRequest<TVars, TResult> {
  const controller = useRef<AbortController | null>(null)
  const [result, setResult] = useState<TResult>()

  const mutation = useMutation<TResult, unknown, TVars>({
    mutationFn: (variables) => {
      controller.current?.abort()
      const next = new AbortController()
      controller.current = next
      return request(variables, { signal: next.signal })
    },
    onSuccess: (data) => {
      setResult(data)
      // Read from the live options object, so the callback is the current
      // render's rather than the one captured when the request started.
      options.onSuccess?.(data)
    },
    // AI failures render inline, in the panel the user is looking at. A toast
    // would duplicate a message that is already on screen and easy to miss.
    meta: { suppressErrorToast: true },
  })

  // An in-flight model call outlives the component that started it unless it is
  // aborted here — and an unmounted panel has nowhere to put the answer.
  useEffect(() => () => controller.current?.abort(), [])

  const { mutate, reset: resetMutation } = mutation

  const run = useCallback((variables: TVars) => mutate(variables), [mutate])

  const cancel = useCallback(() => controller.current?.abort(), [])

  const reset = useCallback(() => {
    controller.current?.abort()
    setResult(undefined)
    resetMutation()
  }, [resetMutation])

  const error =
    mutation.error !== null && !isAbortError(mutation.error)
      ? toApiError(mutation.error)
      : undefined

  return {
    run,
    cancel,
    reset,
    isPending: mutation.isPending,
    result,
    error,
    lastVariables: mutation.variables,
  }
}
