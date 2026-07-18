/**
 * URL and query-string construction.
 *
 * Extracted from the HTTP client so the same rules govern every URL the app
 * builds — request URLs, and later the shareable list URLs the router owns.
 * Framework-agnostic and side-effect free.
 */

/** Values that can be expressed in a query string without ambiguity. */
export type QueryParamValue = string | number | boolean | null | undefined | (string | number)[]

export type QueryParams = Record<string, QueryParamValue>

/**
 * Serialize params to a query string.
 *
 * Rules, applied consistently everywhere:
 *  - `null` and `undefined` are **omitted**, never sent as the strings
 *    `"null"`/`"undefined"` — the backend treats an absent optional filter very
 *    differently from one set to a literal `"undefined"`.
 *  - Empty strings are omitted for the same reason (an empty `name_contains`
 *    would fail the backend's `min_length=1`).
 *  - Arrays are repeated as `key=a&key=b`, matching FastAPI's list handling.
 *  - Keys are emitted in sorted order so the same logical query always produces
 *    a byte-identical string — which keeps query keys and HTTP caches stable.
 */
export function buildQueryString(params: QueryParams | undefined): string {
  if (!params) return ""

  const search = new URLSearchParams()

  for (const key of Object.keys(params).sort()) {
    const value = params[key]
    if (value === null || value === undefined) continue

    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item))
      continue
    }

    const serialized = String(value)
    if (serialized === "") continue
    search.append(key, serialized)
  }

  return search.toString()
}

/**
 * Join a base URL and a path without producing a double slash or dropping a
 * segment. The base is expected to be trailing-slash-free (`appConfig`
 * guarantees this); the path is expected to be absolute (`/characters`).
 */
export function joinUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${baseUrl}${normalizedPath}`
}

/** Build a full request URL from base, path, and params. */
export function buildUrl(baseUrl: string, path: string, params?: QueryParams): string {
  const url = joinUrl(baseUrl, path)
  const queryString = buildQueryString(params)
  return queryString ? `${url}?${queryString}` : url
}

/**
 * Percent-encode a value destined for a URL *path* segment, so an id containing
 * a slash or space cannot break out of its segment.
 */
export function encodePathSegment(value: string | number): string {
  return encodeURIComponent(String(value))
}
