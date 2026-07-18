/**
 * Defensive date handling.
 *
 * `created_at` is a plain string the backend writes with
 * `datetime.now(UTC).isoformat()` — there is no server-side format guarantee and
 * no type coercion (docs/frontend/API_INTEGRATION_PLAN.md §3 gotcha #6). So the
 * schema keeps it as a string and every conversion goes through here, where an
 * unparseable value degrades to `null` instead of rendering "Invalid Date".
 */

/** Parse an ISO string to a `Date`, or `null` if it is absent or malformed. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Absolute date, e.g. "18 Jul 2026". Returns `fallback` for unparseable input. */
export function formatDate(value: string | null | undefined, fallback = "—"): string {
  const date = parseIsoDate(value)
  if (!date) return fallback
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

/** Absolute date and time, for detail views where precision matters. */
export function formatDateTime(value: string | null | undefined, fallback = "—"): string {
  const date = parseIsoDate(value)
  if (!date) return fallback
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
]

/** Relative time, e.g. "3 days ago". Falls back to `fallback` if unparseable. */
export function formatRelativeTime(value: string | null | undefined, fallback = "—"): string {
  const date = parseIsoDate(value)
  if (!date) return fallback

  const elapsed = date.getTime() - Date.now()
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

  for (const [unit, msPerUnit] of RELATIVE_UNITS) {
    if (Math.abs(elapsed) >= msPerUnit) {
      return formatter.format(Math.round(elapsed / msPerUnit), unit)
    }
  }

  return formatter.format(Math.round(elapsed / 1000), "second")
}
