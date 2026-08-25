import type { ReactNode } from "react"

import { EntityChip } from "@/features/ai/components/EntityChip"
import type { RetrievalResult } from "@/features/ai/model/ai.schema"
import { SectionLabel } from "@/shared/ui/composite/SectionLabel"

/**
 * What the model was actually given.
 *
 * The plan behind the backend calls `/ai/retrieve` "the only window into why an
 * answer was wrong", and this is that window. It is collapsed by default and
 * carries no controls — no `top_k`, no `depth` — because tuning knobs would put
 * a configuration surface on one AI feature and none of the others, and the
 * backend defaults are the ones every answer is actually produced with.
 *
 * The three sections are the Graph RAG story in order:
 *
 *  - **Seeds** are what vector similarity matched, with their cosine scores.
 *    Scores are shown rather than hidden because their *spread* is the readable
 *    signal — a top seed at 0.71 against a tail at 0.62 says something very
 *    different from a flat run of 0.64s. (What they are not is a threshold:
 *    unrelated text scores around 0.6, not 0, which is why the backend ranks
 *    rather than filters.)
 *  - **Added by expansion** is everything graph traversal pulled in, which is
 *    the entire argument for doing this over a graph at all: the answer to
 *    "who would object" is rarely inside any single entity's own text.
 *  - **Connections** are the induced-subgraph edges that justified them.
 *
 * Rendered from `AskResponse.retrieval` on the happy path, and from a live
 * `/ai/retrieve` when generation failed — one component, two sources.
 */

interface RetrievalTraceProps {
  retrieval: RetrievalResult
}

function TraceSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  )
}

export function RetrievalTrace({ retrieval }: RetrievalTraceProps) {
  const seedIds = new Set(retrieval.seeds.map((seed) => seed.id))
  const expanded = retrieval.entities.filter((entity) => !seedIds.has(entity.id))
  const namesById = new Map(retrieval.entities.map((entity) => [entity.id, entity.name]))

  return (
    <div className="flex flex-col gap-4 pt-1">
      <p className="text-2xs text-muted-foreground">
        {retrieval.seeds.length} seeds · {retrieval.entities.length} entities ·{" "}
        {retrieval.relationships.length} connections · {retrieval.charCount.toLocaleString()}{" "}
        characters of context
      </p>

      {retrieval.seeds.length > 0 ? (
        <TraceSection label="Matched the question">
          <div className="flex flex-wrap gap-1.5">
            {retrieval.seeds.map((seed) => (
              <EntityChip
                key={seed.id}
                id={seed.id}
                kind={seed.kind}
                name={seed.name}
                suffix={seed.score === null ? undefined : seed.score.toFixed(2)}
              />
            ))}
          </div>
        </TraceSection>
      ) : null}

      {expanded.length > 0 ? (
        <TraceSection label="Added by expansion">
          <div className="flex flex-wrap gap-1.5">
            {expanded.map((entity) => (
              <EntityChip key={entity.id} id={entity.id} kind={entity.kind} name={entity.name} />
            ))}
          </div>
        </TraceSection>
      ) : null}

      {retrieval.relationships.length > 0 ? (
        <TraceSection label="Connections">
          {/* Its own scroll container: a long relationship type plus two long
              names overflows narrow panels, and the page must never scroll
              sideways because of it. */}
          <div className="overflow-x-auto">
            <ul className="flex min-w-0 flex-col gap-1 font-mono text-2xs text-muted-foreground">
              {retrieval.relationships.map((edge, index) => (
                <li key={`${edge.source}-${edge.relType}-${edge.target}-${index}`}>
                  <span className="whitespace-nowrap">
                    {namesById.get(edge.source) ?? edge.source}
                    <span className="mx-1.5 text-foreground/60">—{edge.relType}→</span>
                    {namesById.get(edge.target) ?? edge.target}
                    {edge.sentiment ? <span className="ml-1.5">({edge.sentiment})</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </TraceSection>
      ) : null}
    </div>
  )
}
