/**
 * Turning a grounded answer into something readable.
 *
 * The context block handed to the model is a list of `[{id}] {Label}: {Name}`
 * lines, and the system prompt asks it to cite by that bracketed id — so the
 * answer comes back with raw UUIDs sitting inline in the prose:
 *
 *   "Kestrelwatch [3f2a…] is held by the Verge Watch [9c81…]."
 *
 * Rendering that verbatim is unreadable, so this module splits the prose into
 * text and citation segments that the view turns into entity chips. It is pure
 * — no React, no fetch — which is also what makes it testable in a suite that
 * has no DOM.
 *
 * Three cases, and the distinction between them is the whole point:
 *
 *  1. **A bracket holding ids that were actually retrieved** → a citation. These
 *     are the only ones we can render, because only these have a name and kind.
 *  2. **A bracket holding UUID-shaped text that was *not* retrieved** → dropped.
 *     The backend already filters invented ids out of `citations`, but the
 *     *inline* markers are raw model output and carry no such guarantee. A
 *     hallucinated id must not be presented as a source, and showing a bare
 *     UUID would be worse than showing nothing.
 *  3. **Any other bracket** → left exactly as written. Prose legitimately uses
 *     brackets, and silently eating "[sic]" would be a worse bug than the one
 *     this function exists to fix.
 */

import type { RetrievedEntity } from "@/features/ai/model/ai.schema"

export type AnswerSegment =
  { kind: "text"; text: string } | { kind: "citation"; entity: RetrievedEntity }

/** Any bracketed run that contains no nested bracket. */
const BRACKETED = /\[([^\]]*)\]/g

/** The id shape the backend actually mints, and therefore what the model echoes. */
const UUID_LIKE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * True where a dropped citation marker should take its leading space with it,
 * so "held by the Verge Watch [bad-id]." does not become "…Verge Watch ."
 */
function isTrailingBoundary(char: string | undefined): boolean {
  return char === undefined || /[\s.,;:!?)\]]/.test(char)
}

/**
 * Split an answer into renderable segments.
 *
 * `entities` should be the retrieval's entity set — every entity the answer is
 * allowed to cite — not just `citations`, because the inline markers may name a
 * retrieved entity the model did not list in its citation line.
 */
export function parseAnswer(answer: string, entities: readonly RetrievedEntity[]): AnswerSegment[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]))
  const segments: AnswerSegment[] = []

  let pending = ""
  let cursor = 0

  function flushText() {
    if (pending !== "") {
      segments.push({ kind: "text", text: pending })
      pending = ""
    }
  }

  for (const match of answer.matchAll(BRACKETED)) {
    const raw = match[0]
    const start = match.index
    if (raw === undefined || start === undefined) continue

    pending += answer.slice(cursor, start)
    cursor = start + raw.length

    // A single bracket may carry several ids ("[a, b]") — models do that even
    // when the prompt shows one per bracket.
    const tokens = (match[1] ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token !== "")

    const resolved = tokens.map((token) => byId.get(token))

    if (tokens.length > 0 && resolved.every((entity) => entity !== undefined)) {
      flushText()
      for (const entity of resolved) segments.push({ kind: "citation", entity })
      continue
    }

    if (tokens.length > 0 && tokens.every((token) => UUID_LIKE.test(token))) {
      // An id the model produced that was never retrieved. Drop it, and the
      // space that introduced it when the prose reads better without.
      if (isTrailingBoundary(answer[cursor])) pending = pending.replace(/[ \t]+$/, "")
      continue
    }

    pending += raw
  }

  pending += answer.slice(cursor)
  flushText()

  return segments
}

/**
 * The entities behind an answer's `citations`, in the order the backend
 * reported them.
 *
 * `citations` arrives already validated server-side against the retrieved ids,
 * so a miss here means the trace was withheld (`debug: false`) rather than that
 * the model invented something. Either way an id with no entity behind it has
 * nothing to render, so it is dropped.
 */
export function resolveCitations(
  citations: readonly string[],
  entities: readonly RetrievedEntity[],
): RetrievedEntity[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]))
  const seen = new Set<string>()
  const resolved: RetrievedEntity[] = []

  for (const id of citations) {
    if (seen.has(id)) continue
    const entity = byId.get(id)
    if (entity === undefined) continue
    seen.add(id)
    resolved.push(entity)
  }

  return resolved
}
