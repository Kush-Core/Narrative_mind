/**
 * TanStack QueryClient factory (docs/frontend/API_INTEGRATION_PLAN.md §5, §7).
 *
 * Policy decisions live here, once:
 *  - reads retry with backoff, but never on deterministic 4xx failures;
 *  - mutations never retry automatically (no idempotency guarantee);
 *  - a short staleTime keeps navigation instant while edits reconcile
 *    promptly via invalidation.
 */

import { QueryClient } from "@tanstack/react-query"

import { isApiError } from "@/shared/api/api-error"

const MAX_READ_RETRIES = 2

function shouldRetryRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_READ_RETRIES) return false
  if (isApiError(error) && error.isClientError) return false
  return true
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        retry: shouldRetryRead,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  })
}
