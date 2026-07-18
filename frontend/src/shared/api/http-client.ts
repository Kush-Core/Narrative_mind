/**
 * The single network choke point (docs/frontend/API_INTEGRATION_PLAN.md §1).
 *
 * A thin, typed wrapper over native `fetch`: base-URL resolution, JSON
 * (de)serialization, query-string building, cancellation + timeout, the auth
 * seam, and error normalization into `ApiError`. It contains no caching and no
 * retries — those belong to the query layer (TanStack Query).
 *
 * Nothing outside `shared/api` and feature resource modules may call `fetch`.
 */

import { apiErrorFromException, apiErrorFromResponse } from "@/shared/api/api-error"
import { type AuthTokenProvider, nullAuthTokenProvider } from "@/shared/api/auth"
import { appConfig } from "@/shared/config/env"

export type QueryParamValue = string | number | boolean | null | undefined

export interface RequestOptions {
  /** Query parameters; `null`/`undefined` entries are omitted. */
  query?: Record<string, QueryParamValue>
  /** JSON request body. */
  body?: unknown
  /** Caller-provided cancellation (TanStack Query passes its own signal). */
  signal?: AbortSignal
  /** Client-side deadline; a hung backend surfaces as a `timeout` ApiError. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000

function buildUrl(path: string, query?: Record<string, QueryParamValue>): string {
  const url = `${appConfig.apiBaseUrl}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

function combineSignals(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  const text = await response.text()
  if (text === "") return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export class HttpClient {
  #auth: AuthTokenProvider

  constructor(auth: AuthTokenProvider = nullAuthTokenProvider) {
    this.#auth = auth
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const { query, body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options

    const headers = new Headers()
    if (body !== undefined) headers.set("content-type", "application/json")
    const token = await this.#auth.getToken()
    if (token) headers.set("authorization", `Bearer ${token}`)

    let response: Response
    try {
      response = await fetch(buildUrl(path, query), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: combineSignals(timeoutMs, signal),
      })
    } catch (cause) {
      // Caller-initiated aborts propagate untouched so the query layer can
      // recognize and silently discard them.
      if (signal?.aborted) throw cause
      throw apiErrorFromException(cause)
    }

    const parsed = await parseBody(response)
    if (!response.ok) throw apiErrorFromResponse(response.status, parsed)
    return parsed as T
  }

  get<T>(path: string, options?: Omit<RequestOptions, "body">): Promise<T> {
    return this.request<T>("GET", path, options)
  }

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body">): Promise<T> {
    return this.request<T>("POST", path, { ...options, body })
  }

  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body">): Promise<T> {
    return this.request<T>("PATCH", path, { ...options, body })
  }

  delete<T = void>(path: string, options?: Omit<RequestOptions, "body">): Promise<T> {
    return this.request<T>("DELETE", path, options)
  }
}

/** The app-wide client instance. Feature resource modules import this. */
export const httpClient = new HttpClient()
