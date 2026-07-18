/**
 * Normalized API error model.
 *
 * The backend produces two distinct error shapes (see
 * docs/frontend/API_INTEGRATION_PLAN.md §4):
 *
 *  1. Domain envelope — `{"error": {"code": "...", "message": "..."}}`
 *     (registered exception handlers: not_found / conflict /
 *     domain_validation / bad_request)
 *  2. FastAPI request validation — `{"detail": [{loc, msg, type}, ...]}`
 *     (HTTP 422 from Pydantic request parsing)
 *
 * Both — plus transport failures — collapse into a single `ApiError` so the
 * rest of the app handles exactly one error type.
 */

export type ApiErrorCode =
  | "not_found"
  | "conflict"
  | "domain_validation"
  | "bad_request"
  | "validation"
  | "network"
  | "timeout"
  | "unknown"

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  /** Field-level messages keyed by field name (FastAPI 422 `loc` paths). */
  readonly fieldErrors?: Readonly<Record<string, string>>

  constructor(options: {
    status: number
    code: ApiErrorCode
    message: string
    fieldErrors?: Record<string, string>
    cause?: unknown
  }) {
    super(options.message, { cause: options.cause })
    this.name = "ApiError"
    this.status = options.status
    this.code = options.code
    this.fieldErrors = options.fieldErrors
  }

  /** Deterministic failures that must never be retried automatically. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }
}

/* ------------------------------------------------------------------ shapes */

interface DomainErrorBody {
  error: { code: string; message: string }
}

interface FastApiValidationItem {
  loc: (string | number)[]
  msg: string
  type: string
}

interface FastApiValidationBody {
  detail: FastApiValidationItem[]
}

const DOMAIN_CODES: ReadonlySet<string> = new Set([
  "not_found",
  "conflict",
  "domain_validation",
  "bad_request",
])

function isDomainErrorBody(body: unknown): body is DomainErrorBody {
  if (typeof body !== "object" || body === null) return false
  const error = (body as { error?: unknown }).error
  if (typeof error !== "object" || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return typeof code === "string" && typeof message === "string"
}

function isFastApiValidationBody(body: unknown): body is FastApiValidationBody {
  if (typeof body !== "object" || body === null) return false
  const detail = (body as { detail?: unknown }).detail
  return (
    Array.isArray(detail) &&
    detail.every(
      (item): item is FastApiValidationItem =>
        typeof item === "object" &&
        item !== null &&
        Array.isArray((item as FastApiValidationItem).loc) &&
        typeof (item as FastApiValidationItem).msg === "string",
    )
  )
}

/** `loc` is e.g. ["body", "name"] or ["query", "limit"] — the field is the tail. */
function fieldErrorsFromDetail(detail: FastApiValidationItem[]): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const item of detail) {
    const field = item.loc.at(-1)
    if (typeof field === "string" && !(field in fields)) {
      fields[field] = item.msg
    }
  }
  return fields
}

/* -------------------------------------------------------------- normalizer */

/** Normalize a non-2xx HTTP response body into an `ApiError`. */
export function apiErrorFromResponse(status: number, body: unknown): ApiError {
  if (isDomainErrorBody(body)) {
    const rawCode = body.error.code
    const code: ApiErrorCode = DOMAIN_CODES.has(rawCode) ? (rawCode as ApiErrorCode) : "unknown"
    return new ApiError({ status, code, message: body.error.message })
  }

  if (isFastApiValidationBody(body)) {
    return new ApiError({
      status,
      code: "validation",
      message: "The request contained invalid fields.",
      fieldErrors: fieldErrorsFromDetail(body.detail),
    })
  }

  return new ApiError({
    status,
    code: "unknown",
    message: `Request failed with status ${status}.`,
    cause: body,
  })
}

/** Normalize a thrown transport-level failure (fetch reject, abort, timeout). */
export function apiErrorFromException(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause

  if (cause instanceof DOMException && cause.name === "TimeoutError") {
    return new ApiError({
      status: 0,
      code: "timeout",
      message: "The server took too long to respond.",
      cause,
    })
  }

  return new ApiError({
    status: 0,
    code: "network",
    message: "Could not reach the server.",
    cause,
  })
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}
