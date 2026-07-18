/**
 * The system query layer — the reference implementation of a slice's
 * `queries/` module: keys from the central registry, caching policy, and a
 * derived view model for the UI.
 *
 * Backend reachability is polled rather than fetched once, because it is
 * ambient truth that changes without the user doing anything
 * (docs/frontend/API_INTEGRATION_PLAN.md §7).
 */

import { useQuery } from "@tanstack/react-query"

import { getHealth } from "@/features/system/api/system.api"
import { isApiError } from "@/shared/api/api-error"
import { queryKeys } from "@/shared/api/query-keys"
import { appConfig } from "@/shared/config/env"

/** What the status bar displays (see `ConnectionStatus` in the shell). */
export type ConnectionStatus = "unknown" | "connected" | "degraded" | "offline"

export function useHealthQuery() {
  const query = useQuery({
    queryKey: queryKeys.system.health(),
    queryFn: ({ signal }) => getHealth({ signal }),
    refetchInterval: appConfig.healthPollIntervalMs,
    // Poll on a fixed cadence even when the tab is idle, so returning to the
    // window shows current truth rather than a stale indicator.
    refetchIntervalInBackground: false,
    // Reachability is worth exactly one retry: a slow first attempt should not
    // flash "offline", but three attempts would delay honest bad news.
    retry: 1,
    staleTime: appConfig.healthPollIntervalMs,
    // A failed health check is the answer, not an error to shout about — the
    // indicator itself is the report.
    meta: { suppressErrorToast: true },
  })

  return { ...query, status: toConnectionStatus(query) }
}

interface HealthQueryState {
  data?: { isHealthy: boolean }
  isPending: boolean
  error: unknown
}

/**
 * Collapse query state into the four states the status bar knows how to show.
 *
 * `degraded` distinguishes "the backend answered, but said it is unwell" from
 * `offline` ("the backend did not answer"), which are very different problems
 * for whoever is running the app.
 */
export function toConnectionStatus({ data, isPending, error }: HealthQueryState): ConnectionStatus {
  if (isPending) return "unknown"
  if (error) {
    if (isApiError(error) && (error.code === "network" || error.code === "timeout")) {
      return "offline"
    }
    return "degraded"
  }
  if (!data) return "unknown"
  return data.isHealthy ? "connected" : "degraded"
}
