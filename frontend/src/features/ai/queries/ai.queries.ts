/**
 * The four AI hooks.
 *
 * Each is a one-line binding of a resource function to `useAiRequest`, which
 * owns cancellation, the cancel-is-not-a-failure rule, and result retention.
 * Written as four named hooks rather than one parameterised one so a call site
 * reads as what it does (`useAsk()`) and its result type is inferred without a
 * type argument.
 *
 * Deliberately no query keys and no cache: see `useAiRequest`'s docstring — an
 * LLM answer is not server state, and none of these four results is shared
 * between screens.
 */

import {
  askWorld,
  describeEntity,
  extractFromPassage,
  retrieveForQuestion,
} from "@/features/ai/api/ai.api"
import type {
  AskForm,
  AskResult,
  DescribeForm,
  DescribeResult,
  ExtractForm,
  ExtractResult,
  RetrievalResult,
} from "@/features/ai/model/ai.schema"
import {
  type AiRequest,
  type AiRequestOptions,
  useAiRequest,
} from "@/features/ai/queries/useAiRequest"

/**
 * Prose for an entity, from its name and traits.
 *
 * The only one of the four that takes an `onSuccess`: its result is written
 * into a form field the user may already be typing in, so it has to be applied
 * at the moment it arrives rather than reconciled afterwards.
 */
export function useDescribe(
  options?: AiRequestOptions<DescribeResult>,
): AiRequest<DescribeForm, DescribeResult> {
  return useAiRequest(describeEntity, options)
}

/** Entities and relationships proposed from a passage. Read-only. */
export function useExtract(): AiRequest<ExtractForm, ExtractResult> {
  return useAiRequest(extractFromPassage)
}

/** A grounded answer over the caller's world, with a retrieval trace. */
export function useAsk(): AiRequest<AskForm, AskResult> {
  return useAiRequest(askWorld)
}

/**
 * Retrieval with no model in the loop.
 *
 * The degraded path: this still answers when the chat provider is unreachable,
 * which is when `useAsk` cannot. Not used on the happy path — `useAsk` already
 * carries the trace back with the answer.
 */
export function useRetrieve(): AiRequest<{ question: string }, RetrievalResult> {
  return useAiRequest(retrieveForQuestion)
}
