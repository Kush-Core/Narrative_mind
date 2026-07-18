/**
 * List state lives in the URL (docs/frontend/STATE_MANAGEMENT.md §3, D6).
 *
 * The query string is the *source of truth* for filters, sort, and pagination:
 * every filtered view is deep-linkable, the back button works, and a reload
 * restores exactly what was on screen. There is no parallel "filter state" in a
 * store to drift out of sync.
 *
 * This hook is the typed, validated boundary around that. Params are parsed
 * through the entity's Zod schema, so a hand-edited or stale URL degrades
 * gracefully to valid defaults instead of issuing a request the backend would
 * reject with a 422.
 */

import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import type { z } from "zod"

/** Params that reset paging when they change — a new filter means a new page 1. */
const PAGING_RESET_KEYS = new Set([
  "nameContains",
  "sortBy",
  "order",
  "status",
  "region",
  "ideology",
])

export interface UrlListState<TParams> {
  /** Validated, defaulted params — safe to hand straight to a query. */
  params: TParams
  /** Merge a partial change; resets `offset` unless the change is paging itself. */
  setParams: (next: Partial<Record<string, string | number | undefined>>) => void
  /** Restore every param to its schema default. */
  reset: () => void
  /** True when any filter or sort differs from the defaults. */
  isFiltered: boolean
}

export function useUrlListState<TSchema extends z.ZodType>(
  schema: TSchema,
): UrlListState<z.infer<TSchema>> {
  const [searchParams, setSearchParams] = useSearchParams()

  const params = useMemo(() => {
    const raw = Object.fromEntries(searchParams.entries())
    const result = schema.safeParse(raw)
    // A malformed URL falls back to defaults rather than erroring: the address
    // bar is user-editable, and a typo there should not break the screen.
    return result.success ? result.data : schema.parse({})
  }, [searchParams, schema])

  const setParams = useCallback(
    (next: Partial<Record<string, string | number | undefined>>) => {
      setSearchParams(
        (current) => {
          const updated = new URLSearchParams(current)

          for (const [key, value] of Object.entries(next)) {
            if (value === undefined || value === "") updated.delete(key)
            else updated.set(key, String(value))
          }

          // Changing what is being looked at should return to the first page;
          // otherwise a filter applied from page 5 shows an empty result.
          const changedKeys = Object.keys(next)
          const changesPaging = changedKeys.some((key) => key === "offset" || key === "limit")
          if (!changesPaging && changedKeys.some((key) => PAGING_RESET_KEYS.has(key))) {
            updated.delete("offset")
          }

          return updated
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const reset = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [setSearchParams])

  const isFiltered = useMemo(
    () => [...searchParams.keys()].some((key) => PAGING_RESET_KEYS.has(key)),
    [searchParams],
  )

  return { params, setParams, reset, isFiltered }
}
