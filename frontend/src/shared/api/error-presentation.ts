/**
 * Deciding what the user sees when something fails.
 *
 * `api-error.ts` classifies failures; this module routes them. The routing
 * policy is fixed by docs/frontend/API_INTEGRATION_PLAN.md §4 and lives here in
 * one place so every screen fails the same way:
 *
 *  - **field**  → inline on the form, never a toast (the user is looking at the
 *                 field; a toast would be redundant and easy to miss)
 *  - **inline** → an `ErrorState` in place of the content, with retry (a read
 *                 failed; there is nothing to show)
 *  - **toast**  → non-blocking notification (a write failed; the surrounding
 *                 content is still valid and interactive)
 *  - **silent** → nothing (a canceled request is not a failure)
 */

import { ApiError, isApiError } from "@/shared/api/api-error"

export type ErrorPresentation = "field" | "inline" | "toast" | "silent"

/** Any thrown value, normalized — third-party code can throw non-Errors. */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error

  return new ApiError({
    status: 0,
    code: "unknown",
    message: error instanceof Error ? error.message : "An unexpected error occurred.",
    cause: error,
  })
}

/**
 * How this failure should be shown.
 *
 * `context` matters: the same 422 belongs inline on a form the user is editing,
 * but as a toast when it comes from a background action with no form on screen.
 */
export function getErrorPresentation(
  error: unknown,
  context: "read" | "write" = "read",
): ErrorPresentation {
  const apiError = toApiError(error)

  if (apiError.code === "canceled") return "silent"
  if (apiError.hasFieldErrors && context === "write") return "field"
  return context === "read" ? "inline" : "toast"
}

/**
 * A message safe to show the user.
 *
 * Domain messages come straight from the backend and are written for humans
 * (`"Character not found"`); transport and parse failures use the client's own
 * wording, because their underlying messages ("Failed to fetch") are noise.
 */
export function toUserMessage(error: unknown): string {
  const apiError = toApiError(error)

  switch (apiError.code) {
    case "network":
      return "Could not reach the server. Check that the backend is running."
    case "timeout":
      return "The server took too long to respond."
    case "parse":
      return "The server returned data in an unexpected format."
    case "server":
      return "The server encountered an error. Please try again."
    default:
      return apiError.message
  }
}

/**
 * A short title for a toast, paired with `toUserMessage` as the body.
 */
export function toUserTitle(error: unknown): string {
  const apiError = toApiError(error)

  switch (apiError.code) {
    case "not_found":
      return "Not found"
    case "conflict":
      return "Conflict"
    case "validation":
    case "domain_validation":
      return "Invalid data"
    case "authentication_error":
      return "Sign-in required"
    case "network":
    case "timeout":
      return "Connection problem"
    case "server":
      return "Server error"
    default:
      return "Something went wrong"
  }
}

/**
 * Field-level messages for a form, or an empty object.
 *
 * Returned as a plain record rather than being applied directly, so this module
 * stays free of any form-library dependency — the caller hands the result to
 * React Hook Form's `setError` when forms arrive in M3.
 */
export function getFieldErrors(error: unknown): Record<string, string> {
  const apiError = toApiError(error)
  return apiError.fieldErrors ? { ...apiError.fieldErrors } : {}
}

/** Whether offering the user a "try again" control makes sense. */
export function isRetryable(error: unknown): boolean {
  return toApiError(error).isRetryable
}
