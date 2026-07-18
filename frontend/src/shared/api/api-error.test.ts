/**
 * Error normalization — the highest-risk logic in the network spine.
 *
 * The backend emits two structurally different error bodies, *both* capable of
 * returning HTTP 422 (docs/frontend/API_INTEGRATION_PLAN.md §4). Getting the
 * discrimination wrong would route form-field errors to a toast and domain
 * messages to nowhere, so each shape is pinned down here.
 */

import { describe, expect, it } from "vitest"

import { apiErrorFromException, apiErrorFromResponse, isApiError } from "@/shared/api/api-error"
import { getFieldErrors, toUserMessage } from "@/shared/api/error-presentation"

describe("domain error envelope", () => {
  it("keeps the backend's code and human-readable message", () => {
    const error = apiErrorFromResponse(404, {
      error: { code: "not_found", message: "Character not found" },
    })

    expect(error.code).toBe("not_found")
    expect(error.message).toBe("Character not found")
    expect(error.isNotFound).toBe(true)
    expect(error.isClientError).toBe(true)
    expect(error.isRetryable).toBe(false)
  })

  it("recognises a domain 422 as domain_validation, not a field-level failure", () => {
    const error = apiErrorFromResponse(422, {
      error: { code: "domain_validation", message: "rel_type must be one of KNOWS, MEMBER_OF" },
    })

    expect(error.code).toBe("domain_validation")
    expect(error.hasFieldErrors).toBe(false)
    expect(error.message).toContain("rel_type")
  })

  it("falls back to a status-derived code when the envelope carries an unknown code", () => {
    const error = apiErrorFromResponse(409, {
      error: { code: "some_future_code", message: "Name already taken" },
    })

    expect(error.code).toBe("conflict")
    expect(error.message).toBe("Name already taken")
  })

  it("handles conflict, which the backend defines but does not yet raise", () => {
    const error = apiErrorFromResponse(409, {
      error: { code: "conflict", message: "Already exists" },
    })

    expect(error.code).toBe("conflict")
  })
})

describe("FastAPI request-validation errors", () => {
  it("maps loc paths to field errors", () => {
    const error = apiErrorFromResponse(422, {
      detail: [
        {
          loc: ["body", "name"],
          msg: "String should have at least 1 character",
          type: "too_short",
        },
        { loc: ["body", "aliases"], msg: "List should have at most 10 items", type: "too_long" },
      ],
    })

    expect(error.code).toBe("validation")
    expect(error.hasFieldErrors).toBe(true)
    expect(getFieldErrors(error)).toEqual({
      name: "String should have at least 1 character",
      aliases: "List should have at most 10 items",
    })
  })

  it("keeps only the first message per field", () => {
    const error = apiErrorFromResponse(422, {
      detail: [
        { loc: ["body", "name"], msg: "first", type: "a" },
        { loc: ["body", "name"], msg: "second", type: "b" },
      ],
    })

    expect(getFieldErrors(error)).toEqual({ name: "first" })
  })

  it("handles query-parameter validation, not just body fields", () => {
    const error = apiErrorFromResponse(422, {
      detail: [{ loc: ["query", "limit"], msg: "Input should be less than or equal to 100" }],
    })

    expect(getFieldErrors(error)).toEqual({
      limit: "Input should be less than or equal to 100",
    })
  })
})

describe("unrecognised bodies", () => {
  it("falls back to a status-appropriate message for an empty body", () => {
    const error = apiErrorFromResponse(500, undefined)

    expect(error.code).toBe("server")
    expect(error.isRetryable).toBe(true)
    expect(error.message).toBe("The server encountered an error.")
  })

  it("survives a non-JSON body, such as a proxy's HTML error page", () => {
    const error = apiErrorFromResponse(502, "<html>Bad Gateway</html>")

    expect(error.code).toBe("server")
    expect(error.message).toBe("The server is unreachable.")
  })
})

describe("transport failures", () => {
  it("normalizes a timeout", () => {
    const error = apiErrorFromException(new DOMException("timeout", "TimeoutError"))

    expect(error.code).toBe("timeout")
    expect(error.isRetryable).toBe(true)
  })

  it("distinguishes a caller-initiated abort from a real failure", () => {
    const error = apiErrorFromException(new DOMException("aborted", "AbortError"))

    expect(error.code).toBe("canceled")
    expect(error.isRetryable).toBe(false)
  })

  it("normalizes an unreachable server", () => {
    const error = apiErrorFromException(new TypeError("Failed to fetch"))

    expect(error.code).toBe("network")
    expect(isApiError(error)).toBe(true)
    expect(toUserMessage(error)).toContain("Could not reach the server")
  })

  it("passes an existing ApiError through unchanged", () => {
    const original = apiErrorFromResponse(404, { error: { code: "not_found", message: "Gone" } })

    expect(apiErrorFromException(original)).toBe(original)
  })
})
