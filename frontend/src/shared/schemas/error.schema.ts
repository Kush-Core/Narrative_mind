/**
 * The two error shapes the backend can emit, described once as schemas.
 *
 * The backend produces **two structurally different error bodies**
 * (analysis §Error Handling, docs/frontend/API_INTEGRATION_PLAN.md §4):
 *
 *  1. **Domain envelope** — from the registered exception handlers:
 *     `{"error": {"code": "not_found", "message": "..."}}`
 *  2. **FastAPI request validation** — from Pydantic parsing, HTTP 422:
 *     `{"detail": [{"loc": ["body","name"], "msg": "...", "type": "..."}]}`
 *
 * Both are 422-capable, which is exactly why they must be told apart by
 * *shape* rather than by status code. Keeping the shapes as schemas here — and
 * out of `api-error.ts` — means the wire contract is described in one language
 * (Zod) throughout the app, and the normalizer stays pure logic.
 */

import { z } from "zod"

/**
 * Domain error codes the backend's handlers can produce. `conflict` is included
 * although no service currently raises it (analysis §Observations #2) — the
 * handler is registered, so the client honours the full contract at zero cost.
 *
 * `authorization_error` and `provider_unavailable` complete the set against
 * `core/error_handlers.py`. The latter is the one that matters in practice:
 * `RagService.ask` wraps a failed model call in `ProviderUnavailableError`, so
 * a 503 from `/ai/ask` carries this code. Without it here the envelope still
 * parsed — the human message survived — but the code fell back to `server`,
 * and the AI surfaces could not tell "the model is down" from a generic 500.
 */
export const DomainErrorCodeSchema = z.enum([
  "not_found",
  "conflict",
  "domain_validation",
  "bad_request",
  "authentication_error",
  "authorization_error",
  "provider_unavailable",
])

export type DomainErrorCode = z.infer<typeof DomainErrorCodeSchema>

/**
 * The envelope shape. `code` is parsed as a plain string rather than the enum so
 * an unrecognised code still matches this shape and keeps its human-readable
 * message; the normalizer decides what to do with an unknown code.
 */
export const DomainErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})

export type DomainErrorBody = z.infer<typeof DomainErrorBodySchema>

/**
 * One FastAPI validation issue. `loc` is a path such as `["body", "name"]` or
 * `["query", "limit"]`; the field is its last segment.
 */
export const ValidationIssueSchema = z.object({
  loc: z.array(z.union([z.string(), z.number()])),
  msg: z.string(),
  type: z.string().optional(),
})

export const ValidationErrorBodySchema = z.object({
  detail: z.array(ValidationIssueSchema),
})

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>
export type ValidationErrorBody = z.infer<typeof ValidationErrorBodySchema>

/**
 * Collapse FastAPI issues into `{ field: message }`.
 *
 * Only the **first** message per field is kept: forms show one message per
 * field, and the first issue is the most specific one Pydantic reports.
 * Issues whose `loc` tail is not a string (an array index, say) are attributed
 * to their nearest named ancestor so nothing is silently dropped.
 */
export function toFieldErrors(issues: ValidationIssue[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {}

  for (const issue of issues) {
    const field = lastNamedSegment(issue.loc)
    if (field !== undefined && !(field in fieldErrors)) {
      fieldErrors[field] = issue.msg
    }
  }

  return fieldErrors
}

/**
 * The last string segment of a `loc` path, ignoring the leading source marker
 * ("body"/"query"/"path") when it is the only segment present.
 */
function lastNamedSegment(loc: ValidationIssue["loc"]): string | undefined {
  const named = loc.filter((segment): segment is string => typeof segment === "string")
  if (named.length === 0) return undefined
  if (named.length === 1) return named[0]
  // Drop the source marker; what remains identifies the field itself.
  return named.at(-1)
}
