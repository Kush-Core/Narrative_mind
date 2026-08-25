import { EntityChip } from "@/features/ai/components/EntityChip"
import { parseAnswer } from "@/features/ai/lib/answer-citations"
import type { RetrievedEntity } from "@/features/ai/model/ai.schema"

/**
 * The answer itself.
 *
 * The model is asked to cite by the bracketed id it was shown, so the prose
 * arrives with raw UUIDs embedded in it. `parseAnswer` turns those into entity
 * chips — the same chip used by the citation row and the retrieval trace, so a
 * reference reads the same wherever it appears — and drops any id that was
 * never retrieved rather than presenting a hallucination as a source.
 *
 * `max-w-prose` because this is the one genuinely long-form text in a workspace
 * built for dense tabular content: a paragraph run to the full width of a
 * desktop panel is not readable, whatever the viewport allows. `whitespace-pre-wrap`
 * keeps the model's own paragraph breaks, which are usually the only structure
 * the answer has.
 */

interface AnswerProseProps {
  answer: string
  /** Everything the answer is allowed to cite — the retrieval's entity set. */
  entities: readonly RetrievedEntity[]
}

export function AnswerProse({ answer, entities }: AnswerProseProps) {
  const segments = parseAnswer(answer, entities)

  return (
    <div className="max-w-prose text-sm leading-relaxed whitespace-pre-wrap text-foreground">
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          // Keyed by position: prose segments are not unique and have no id.
          <span key={index}>{segment.text}</span>
        ) : (
          <EntityChip
            key={index}
            id={segment.entity.id}
            kind={segment.entity.kind}
            name={segment.entity.name}
            className="mx-0.5 align-baseline"
          />
        ),
      )}
    </div>
  )
}
