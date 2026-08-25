/**
 * The AI resource layer.
 *
 * Plain functions over the shared `httpClient`, like `graph.api.ts` and for the
 * same reason: `createEntityResource` encodes the CRUD triad, and none of these
 * four endpoints is a CRUD resource — there is no list, no id, no PATCH. What
 * *is* reused is everything application-level: the single network choke point,
 * error normalization, cancellation, and schema validation
 * (docs/frontend/API_INTEGRATION_PLAN.md §1 — "non-CRUD endpoints remain plain
 * hand-written resource functions").
 *
 * **Every call here passes `aiRequestTimeoutMs`.** The client's ordinary
 * deadline (15s dev / 30s prod) is shorter than these endpoints legitimately
 * take: they run an embedding call, Cypher, and/or a full non-streaming LLM
 * generation with no server-side timeout of their own. Aborting at 15s would
 * cancel requests that were going to succeed. This is the one rule that must
 * hold for all four, so it is applied once, here, rather than at call sites.
 */

import {
  type AskForm,
  AskResponseSchema,
  type AskResult,
  type DescribeForm,
  DescribeResponseSchema,
  type DescribeResult,
  type ExtractForm,
  ExtractResponseSchema,
  type ExtractResult,
  type RetrievalResult,
  RetrievalResultSchema,
  toDescribeBody,
} from "@/features/ai/model/ai.schema"
import { endpoints } from "@/shared/api/endpoints"
import { httpClient } from "@/shared/api/http-client"
import { appConfig } from "@/shared/config/env"

/** Cancellation comes from the caller — see `useAiRequest`. */
export interface AiCallOptions {
  signal?: AbortSignal
}

/** Request options shared by all four calls, so none can forget the deadline. */
function aiRequest(options: AiCallOptions) {
  return { signal: options.signal, timeoutMs: appConfig.aiRequestTimeoutMs }
}

/**
 * Prose for an entity, from its name and a few traits.
 *
 * Reads only the request body — it never touches the caller's graph, which is
 * exactly what separates it from `ask` below.
 */
export function describeEntity(
  input: DescribeForm,
  options: AiCallOptions = {},
): Promise<DescribeResult> {
  return httpClient.post<DescribeResult>(endpoints.ai.describe(), toDescribeBody(input), {
    schema: DescribeResponseSchema,
    ...aiRequest(options),
  })
}

/**
 * Entities and relationships proposed from a passage of prose.
 *
 * Read-only: the backend persists nothing, and neither does the client. The
 * proposals are a reading of the text, not a pending write.
 */
export function extractFromPassage(
  input: ExtractForm,
  options: AiCallOptions = {},
): Promise<ExtractResult> {
  return httpClient.post<ExtractResult>(
    endpoints.ai.extract(),
    { passage: input.passage },
    { schema: ExtractResponseSchema, ...aiRequest(options) },
  )
}

/**
 * Retrieval alone — the seeds, the expanded subgraph, and the context block,
 * with no model in the loop.
 *
 * `top_k` and `depth` are deliberately not sent: the backend defaults (8 / 1,
 * capped at 30 context entities) stand, and exposing them would put tuning
 * knobs on one AI surface and none on the others.
 *
 * This is the app's degraded path. It runs the embedding provider but never the
 * chat provider, so it still answers when the language model is unreachable —
 * which is when the user most needs to see what their world actually contains.
 */
export function retrieveForQuestion(
  input: { question: string },
  options: AiCallOptions = {},
): Promise<RetrievalResult> {
  return httpClient.post<RetrievalResult>(
    endpoints.ai.retrieve(),
    { question: input.question },
    { schema: RetrievalResultSchema, ...aiRequest(options) },
  )
}

/**
 * A grounded answer over the caller's own world, with validated citations.
 *
 * **`debug: true` always.** The retrieval trace is the only window into why an
 * answer was wrong, and it costs the backend nothing extra — retrieval has
 * already run by the time generation starts. Requesting it lazily would mean a
 * second full round trip *including a second LLM call*, which is strictly worse
 * than carrying it on the first.
 */
export function askWorld(input: AskForm, options: AiCallOptions = {}): Promise<AskResult> {
  return httpClient.post<AskResult>(
    endpoints.ai.ask(),
    { question: input.question, debug: true },
    { schema: AskResponseSchema, ...aiRequest(options) },
  )
}
