/**
 * The TanStack QueryClient factory — every caching and retry policy decision,
 * made once (docs/frontend/API_INTEGRATION_PLAN.md §5, §7;
 * STATE_MANAGEMENT.md §2).
 *
 * Policies here, and the reasoning behind each:
 *
 *  - **Reads retry, but never on 4xx.** A 404 or a 422 is deterministic —
 *    retrying re-asks a question already answered, and hammers the backend for
 *    nothing. Only `network`, `timeout`, and 5xx are worth a second attempt.
 *  - **Mutations never retry.** The backend exposes no idempotency key, so a
 *    silent replay of a create could double-write. Retry is user-driven; the
 *    failed action stays on screen and actionable.
 *  - **Short `staleTime`.** Changes here are user-driven and low-frequency, so a
 *    few seconds of staleness makes navigation instant while edits still
 *    reconcile promptly through invalidation.
 *  - **Failed writes toast centrally.** Routing them through the MutationCache
 *    means no feature has to remember to report a failure; a mutation opts out
 *    only when it handles the error itself (a form mapping `fieldErrors` back
 *    onto its fields).
 */

import { MutationCache, QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { isApiError } from "@/shared/api/api-error"
import { getErrorPresentation, toUserMessage, toUserTitle } from "@/shared/api/error-presentation"

const MAX_READ_RETRIES = 2

/** Exponential backoff, capped so a struggling backend is not hammered. */
function retryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 8_000)
}

function shouldRetryRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_READ_RETRIES) return false
  // Deterministic client errors, cancellations, and contract drift are all
  // pointless to retry — only genuinely transient failures qualify.
  if (isApiError(error)) return error.isRetryable
  return true
}

/**
 * Mutations may opt out of the shared toast by setting
 * `meta: { suppressErrorToast: true }` — the escape hatch for forms that show
 * the failure inline instead.
 */
interface MutationMeta {
  suppressErrorToast?: boolean
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        const meta = mutation.options.meta as MutationMeta | undefined
        if (meta?.suppressErrorToast) return

        const presentation = getErrorPresentation(error, "write")
        // A canceled mutation is not a failure, and a field-level error belongs
        // on the form that triggered it.
        if (presentation === "silent" || presentation === "field") return

        toast.error(toUserTitle(error), { description: toUserMessage(error) })
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        // Keep unused data around briefly so back-navigation is instant.
        gcTime: 5 * 60_000,
        retry: shouldRetryRead,
        retryDelay,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  })
}
