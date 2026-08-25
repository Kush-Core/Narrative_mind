/**
 * The normalized error model — every failure in the app becomes one shape.
 *
 * The backend can fail in structurally different ways (two distinct error
 * bodies, described in `shared/schemas/error.schema.ts`), and the network can
 * fail in ways the backend never sees at all. Collapsing all of it into a single
 * `ApiError` here means every consumer — query hooks, forms, toasts, error
 * boundaries — handles exactly one error type
 * (docs/frontend/API_INTEGRATION_PLAN.md §4).
 *
 * This module is pure: it classifies and describes errors. *Deciding what to do*
 * with them (toast, inline field message, retry) is `error-presentation.ts`.
 */

import {
  DomainErrorBodySchema,
  DomainErrorCodeSchema,
  toFieldErrors,
  ValidationErrorBodySchema,
} from "@/shared/schemas/error.schema"

export type ApiErrorCode =
  | "not_found"
  | "conflict"
  | "domain_validation"
  | "bad_request"
  | "authentication_error"
  | "authorization_error"
  | "provider_unavailable"
  | "validation"
  | "network"
  | "timeout"
  | "canceled"
  | "parse"
  | "server"
  | "unknown"

interface ApiErrorOptions {
  status: number
  code: ApiErrorCode
  message: string
  fieldErrors?: Record<string, string>
  /** The request that failed, for logging. Never shown to the user. */
  request?: { method: string; url: string }
  cause?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  /** Field-level messages keyed by field name, from a FastAPI 422. */
  readonly fieldErrors?: Readonly<Record<string, string>>
  readonly request?: Readonly<{ method: string; url: string }>

  constructor(options: ApiErrorOptions) {
    super(options.message, { cause: options.cause })
    this.name = "ApiError"
    this.status = options.status
    this.code = options.code
    this.fieldErrors = options.fieldErrors
    this.request = options.request
  }

  /** Deterministic failures — retrying them changes nothing. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }

  /** Transient failures — worth retrying. */
  get isRetryable(): boolean {
    if (this.code === "network" || this.code === "timeout") return true
    return this.status >= 500
  }

  get isNotFound(): boolean {
    return this.code === "not_found" || this.status === 404
  }

  /** Carries per-field messages a form can display inline. */
  get hasFieldErrors(): boolean {
    return this.fieldErrors !== undefined && Object.keys(this.fieldErrors).length > 0
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

/* ------------------------------------------------------------- normalizers */

/** Generic messages for statuses with no usable body. */
const STATUS_FALLBACKS: Readonly<Record<number, string>> = {
  400: "The request was rejected.",
  401: "You are not signed in.",
  403: "You do not have access to this.",
  404: "That could not be found.",
  409: "That conflicts with something that already exists.",
  422: "The request contained invalid data.",
  500: "The server encountered an error.",
  502: "The server is unreachable.",
  503: "The server is temporarily unavailable.",
  504: "The server took too long to respond.",
}

function statusToCode(status: number): ApiErrorCode {
  if (status === 401) return "authentication_error"
  if (status === 404) return "not_found"
  if (status === 409) return "conflict"
  if (status === 422) return "validation"
  if (status >= 500) return "server"
  if (status >= 400) return "bad_request"
  return "unknown"
}

/**
 * Normalize a non-2xx response into an `ApiError`.
 *
 * Shape is checked before status, deliberately: the backend returns HTTP 422 for
 * *both* domain validation (`{error:{...}}`) and request validation
 * (`{detail:[...]}`), so the status alone cannot tell them apart.
 */
export function apiErrorFromResponse(
  status: number,
  body: unknown,
  request?: { method: string; url: string },
): ApiError {
  const domain = DomainErrorBodySchema.safeParse(body)
  if (domain.success) {
    const rawCode = domain.data.error.code
    const knownCode = DomainErrorCodeSchema.safeParse(rawCode)
    return new ApiError({
      status,
      code: knownCode.success ? knownCode.data : statusToCode(status),
      message: domain.data.error.message,
      request,
      cause: body,
    })
  }

  const validation = ValidationErrorBodySchema.safeParse(body)
  if (validation.success) {
    const fieldErrors = toFieldErrors(validation.data.detail)
    return new ApiError({
      status,
      code: "validation",
      message: summarizeValidation(fieldErrors),
      fieldErrors,
      request,
      cause: body,
    })
  }

  return new ApiError({
    status,
    code: statusToCode(status),
    message: STATUS_FALLBACKS[status] ?? `Request failed with status ${status}.`,
    request,
    cause: body,
  })
}

/**
 * A single readable sentence for a validation failure, used when the error is
 * shown as a toast rather than mapped onto form fields.
 */
function summarizeValidation(fieldErrors: Record<string, string>): string {
  const fields = Object.keys(fieldErrors)
  if (fields.length === 0) return "The request contained invalid data."
  if (fields.length === 1) {
    const field = fields[0]!
    return `${field}: ${fieldErrors[field]!}`
  }
  return `${fields.length} fields are invalid: ${fields.join(", ")}.`
}

/** Normalize a thrown transport failure (fetch reject, abort, timeout). */
export function apiErrorFromException(
  cause: unknown,
  request?: { method: string; url: string },
): ApiError {
  if (isApiError(cause)) return cause

  if (cause instanceof DOMException && cause.name === "TimeoutError") {
    return new ApiError({
      status: 0,
      code: "timeout",
      message: "The server took too long to respond.",
      request,
      cause,
    })
  }

  if (isAbortError(cause)) {
    return new ApiError({
      status: 0,
      code: "canceled",
      message: "The request was canceled.",
      request,
      cause,
    })
  }

  return new ApiError({
    status: 0,
    code: "network",
    message: "Could not reach the server.",
    request,
    cause,
  })
}

/** A response body that did not match the schema the client expected. */
export function apiErrorFromParseFailure(
  cause: unknown,
  request?: { method: string; url: string },
): ApiError {
  return new ApiError({
    status: 0,
    code: "parse",
    message: "The server returned data in an unexpected format.",
    request,
    cause,
  })
}

/**
 * Aborts are a normal part of the app's operation — TanStack Query cancels
 * in-flight reads on navigation and param changes — so they are recognised
 * explicitly and never surfaced to the user as failures.
 */
export function isAbortError(value: unknown): boolean {
  if (value instanceof DOMException && value.name === "AbortError") return true
  return isApiError(value) && value.code === "canceled"
}
