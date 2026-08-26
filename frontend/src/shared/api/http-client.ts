/**
 * The single network choke point (docs/frontend/API_INTEGRATION_PLAN.md §1, D8).
 *
 * A thin typed wrapper over native `fetch`. Its entire job:
 *
 *  - resolve the base URL and build the query string
 *  - manage headers (JSON content type, the auth seam, per-request extras)
 *  - serialize request bodies and parse response bodies
 *  - enforce a client-side deadline and thread the caller's `AbortSignal`
 *  - validate the response against a schema when one is supplied
 *  - normalize *every* failure into an `ApiError`
 *
 * It contains **no caching, no retries, and no React** — those belong to the
 * query layer, which already owns them. Nothing outside `shared/api` and feature
 * resource modules may call `fetch` directly.
 */

import {
  ApiError,
  apiErrorFromException,
  apiErrorFromParseFailure,
  apiErrorFromResponse,
} from "@/shared/api/api-error"
import {
  type AuthTokenProvider,
  nullAuthTokenProvider,
  sessionAuthTokenProvider,
} from "@/shared/api/auth"
import { appConfig } from "@/shared/config/env"
import { buildUrl, type QueryParams } from "@/shared/lib/url"

export type { QueryParams }

/** Anything that can validate and narrow a parsed response body. */
export interface ResponseValidator<T> {
  parse: (input: unknown) => T
}

export interface RequestOptions<T = unknown> {
  /** Query parameters; `null`/`undefined`/empty entries are omitted. */
  query?: QueryParams
  /** JSON request body. */
  body?: unknown
  /** Caller-provided cancellation — TanStack Query passes its own signal here. */
  signal?: AbortSignal
  /** Overrides the environment's default deadline for this request. */
  timeoutMs?: number
  /** Extra headers for this request only. */
  headers?: HeadersInit
  /**
   * Schema to validate the response against. Supplying one is what makes the
   * resource layer's return type trustworthy rather than an unchecked cast.
   */
  schema?: ResponseValidator<T>
}

export interface HttpClientOptions {
  baseUrl?: string
  auth?: AuthTokenProvider
  defaultTimeoutMs?: number
  /**
   * Sent as `credentials` on every request. The backend already sets
   * `allow_credentials=True`, so switching this to `"include"` is the entire
   * change needed for a future cookie/session scheme
   * (docs/frontend/API_INTEGRATION_PLAN.md §8).
   */
  credentials?: RequestCredentials
}

/** HTTP verbs the backend exposes (backend/README.md, "API surface (V1)"). */
type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE"

export class HttpClient {
  readonly #baseUrl: string
  readonly #auth: AuthTokenProvider
  readonly #defaultTimeoutMs: number
  readonly #credentials: RequestCredentials

  constructor(options: HttpClientOptions = {}) {
    this.#baseUrl = options.baseUrl ?? appConfig.apiBaseUrl
    this.#auth = options.auth ?? nullAuthTokenProvider
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? appConfig.requestTimeoutMs
    this.#credentials = options.credentials ?? "same-origin"
  }

  async request<T>(method: HttpMethod, path: string, options: RequestOptions<T> = {}): Promise<T> {
    const { query, body, signal, timeoutMs = this.#defaultTimeoutMs, headers, schema } = options

    const url = buildUrl(this.#baseUrl, path, query)
    const requestInfo = { method, url }

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: await this.#buildHeaders(body !== undefined, headers),
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: this.#credentials,
        signal: combineSignals(timeoutMs, signal),
      })
    } catch (cause) {
      throw this.#reportError(apiErrorFromException(cause, requestInfo))
    }

    const parsed = await readBody(response)

    if (!response.ok) {
      const error = apiErrorFromResponse(response.status, parsed, requestInfo)
      // A rejected token (missing, expired, malformed) is a session event, not
      // just a failed request — the provider clears it so the app notices.
      if (error.status === 401) this.#auth.onUnauthorized?.()
      throw this.#reportError(error)
    }

    if (!schema) return parsed as T

    try {
      return schema.parse(parsed)
    } catch (cause) {
      // A schema failure means the backend contract moved. Surfacing it as a
      // distinct `parse` error — rather than letting a Zod error escape — keeps
      // the "one error type" guarantee and makes the drift obvious.
      throw this.#reportError(apiErrorFromParseFailure(cause, requestInfo))
    }
  }

  get<T>(path: string, options?: Omit<RequestOptions<T>, "body">): Promise<T> {
    return this.request<T>("GET", path, options)
  }

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, "body">): Promise<T> {
    return this.request<T>("POST", path, { ...options, body })
  }

  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, "body">): Promise<T> {
    return this.request<T>("PATCH", path, { ...options, body })
  }

  /** `DELETE` returns 204 with no body, so `void` is the honest default. */
  delete<T = void>(path: string, options?: Omit<RequestOptions<T>, "body">): Promise<T> {
    return this.request<T>("DELETE", path, options)
  }

  async #buildHeaders(hasBody: boolean, extra?: HeadersInit): Promise<Headers> {
    const headers = new Headers(extra)

    headers.set("accept", "application/json")
    if (hasBody && !headers.has("content-type")) {
      headers.set("content-type", "application/json")
    }

    // The auth seam: inert today, one implementation away from real.
    const token = await this.#auth.getToken()
    if (token) headers.set("authorization", `Bearer ${token}`)

    return headers
  }

  #reportError(error: ApiError): ApiError {
    // Canceled requests are routine (navigation, param changes) and are never
    // worth logging.
    if (appConfig.logApiErrors && error.code !== "canceled") {
      console.error(
        `[api] ${error.request?.method ?? "?"} ${error.request?.url ?? "?"} → ${error.code}`,
        error.message,
      )
    }
    return error
  }
}

/**
 * Combine the caller's cancellation with the client's deadline, so whichever
 * fires first aborts the request.
 */
function combineSignals(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/**
 * Read a response body without assuming it is JSON.
 *
 * 204 (used by every DELETE) has no body at all, and an error response from a
 * proxy may well be HTML — so the text is parsed opportunistically and returned
 * as-is when it is not JSON, giving the error normalizer something to work with
 * instead of throwing inside the parser.
 */
async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined

  const text = await response.text()
  if (text === "") return undefined

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

/** The app-wide client. Feature resource modules import this instance. */
export const httpClient = new HttpClient({ auth: sessionAuthTokenProvider })
