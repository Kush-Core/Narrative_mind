import { ChevronRightIcon, MessageCircleQuestionIcon, TelescopeIcon, UsersIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { AiPanel } from "@/features/ai/components/AiPanel"
import { AiPromptField } from "@/features/ai/components/AiPromptField"
import { AiStateRegion } from "@/features/ai/components/AiStateRegion"
import { AnswerProse } from "@/features/ai/components/AnswerProse"
import { EntityChip } from "@/features/ai/components/EntityChip"
import { RetrievalTrace } from "@/features/ai/components/RetrievalTrace"
import { resolveCitations } from "@/features/ai/lib/answer-citations"
import {
  AskFormSchema,
  type AskResult,
  type RetrievalResult,
  type RetrievedEntity,
} from "@/features/ai/model/ai.schema"
import { useAsk, useRetrieve } from "@/features/ai/queries/ai.queries"
import { paths } from "@/routes/paths"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { EmptyState } from "@/shared/ui/composite/EmptyState"
import { SectionLabel } from "@/shared/ui/composite/SectionLabel"

/**
 * Asking the world a question.
 *
 * The whole Ask experience lives here rather than in the page, because it is
 * mounted in two places — the `/ask` route and (from M10 phase 5) the dockable
 * panel — and two copies would drift. The page supplies the frame and the
 * initial question; everything about how asking *behaves* is decided once, here.
 *
 * Three things about this feature are easy to get wrong and are handled
 * explicitly below:
 *
 *  - **A refusal is a correct answer, not an error.** The system prompt asks the
 *    model to decline rather than guess, so "this world does not cover it"
 *    arrives as a 200 with an empty `citations` array. It renders as calm prose
 *    with no citation row.
 *  - **An empty world is not a refusal.** If retrieval found nothing at all,
 *    showing the model's "this world does not cover it" would read as a broken
 *    feature rather than as an empty account. That case gets its own empty state
 *    and a way to fix it.
 *  - **Retrieval survives the model.** `/ai/retrieve` runs the embedding
 *    provider and Cypher but never the chat provider, so when generation fails
 *    the question can still be answered *partially* — here is what you matched,
 *    even though nothing could be written about it.
 */

interface AskPanelProps {
  /**
   * Prefills the question. Deliberately does not submit: arriving at a URL must
   * never spend a model call on the user's behalf.
   */
  initialQuestion?: string
  className?: string
}

/** Which request the result region is currently showing. */
type Mode = "answer" | "retrieval"

export function AskPanel({ initialQuestion = "", className }: AskPanelProps) {
  const [question, setQuestion] = useState(initialQuestion)
  const [mode, setMode] = useState<Mode>("answer")

  const ask = useAsk()
  const retrieve = useRetrieve()

  const parsed = AskFormSchema.safeParse({ question })
  const isPending = ask.isPending || retrieve.isPending

  function submit() {
    if (!parsed.success) return
    setMode("answer")
    ask.run(parsed.data)
  }

  function cancel() {
    ask.cancel()
    retrieve.cancel()
  }

  function showRetrievalInstead() {
    if (!parsed.success) return
    setMode("retrieval")
    retrieve.run({ question: parsed.data.question })
  }

  // Settled answers only: while a re-run is in flight the previous result is
  // still on screen but must not be announced again.
  const settled = mode === "answer" && !ask.isPending ? ask.result : undefined
  const citedCount = settled
    ? resolveCitations(settled.citations, settled.retrieval?.entities ?? []).length
    : 0

  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)}>
      <AiPanel label="Question">
        <AiPromptField
          name="question"
          label="Ask about your world"
          placeholder="Who would object if Aria took Kestrelwatch?"
          value={question}
          onChange={setQuestion}
          // The only inline message is the backend's own: nagging about an empty
          // field the user has not finished typing is noise, and the submit
          // button already reflects whether the question is askable.
          error={ask.error?.fieldErrors?.question}
          isPending={isPending}
          canSubmit={parsed.success && !isPending}
          submitLabel="Ask"
          onSubmit={submit}
          onCancel={cancel}
        />
      </AiPanel>

      <AiPanel label={mode === "answer" ? "Answer" : "Retrieved"} busy={isPending}>
        {/* A persistent live region, so the arrival of an answer is announced
            without reading the whole paragraph aloud. It is empty while a
            request is in flight — `AiPendingSurface` owns that half. */}
        <p role="status" aria-live="polite" className="sr-only">
          {settled === undefined
            ? ""
            : citedCount > 0
              ? `Answer ready, ${citedCount} sources.`
              : "Answer ready."}
        </p>

        {mode === "answer" ? (
          <AiStateRegion
            request={ask}
            pendingLabel="Reading your world…"
            idle={
              <EmptyState
                icon={MessageCircleQuestionIcon}
                title="Ask about your world"
                description="Answers are drawn only from the entities and relationships you have written. If your world does not cover something, it will say so rather than invent it."
              />
            }
            errorAction={
              // Only offered when there is a question to re-run and generation
              // is the part that failed — retrieval never needs the chat model.
              parsed.success && ask.error?.isRetryable === true ? (
                <Button variant="ghost" size="sm" onClick={showRetrievalInstead}>
                  <TelescopeIcon aria-hidden />
                  See what was retrieved
                </Button>
              ) : undefined
            }
          >
            {(result) => <AnswerBody result={result} />}
          </AiStateRegion>
        ) : (
          <AiStateRegion request={retrieve} pendingLabel="Searching your world…">
            {(retrieval) => (
              <>
                <p className="text-xs text-muted-foreground">
                  No answer could be composed, but retrieval does not need the language model. This
                  is what your question matched.
                </p>
                <RetrievalTrace retrieval={retrieval} />
              </>
            )}
          </AiStateRegion>
        )}
      </AiPanel>
    </div>
  )
}

function AnswerBody({ result }: { result: AskResult }) {
  const retrieval = result.retrieval
  const entities: readonly RetrievedEntity[] = retrieval?.entities ?? []

  // Nothing was retrievable — the account is empty, or nothing has been
  // embedded yet. The model's refusal is technically correct here and entirely
  // unhelpful, so it is replaced with the actual problem and its fix.
  if (retrieval !== null && retrieval.entities.length === 0) {
    return (
      <EmptyState
        icon={UsersIcon}
        title="Nothing to answer from"
        description="This world has no entities yet, so there is nothing for a question to match against."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to={paths.characters.list()}>Add a character</Link>
          </Button>
        }
      />
    )
  }

  const cited = resolveCitations(result.citations, entities)

  return (
    <>
      <AnswerProse answer={result.answer} entities={entities} />

      {cited.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t pt-3">
          <SectionLabel>Cited</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {cited.map((entity) => (
              <EntityChip key={entity.id} id={entity.id} kind={entity.kind} name={entity.name} />
            ))}
          </div>
        </div>
      ) : null}

      {retrieval !== null ? <TraceDisclosure retrieval={retrieval} /> : null}
    </>
  )
}

/**
 * A native `<details>` rather than a controlled panel: it is keyboard-operable,
 * announces its own expanded state, and needs no React state to do either.
 */
function TraceDisclosure({ retrieval }: { retrieval: RetrievalResult }) {
  return (
    <details className="group border-t pt-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm text-2xs font-medium tracking-wider text-muted-foreground uppercase focus-ring transition-chrome hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          className="size-3 transition-transform group-open:rotate-90"
          aria-hidden
        />
        Show what was retrieved
      </summary>
      <RetrievalTrace retrieval={retrieval} />
    </details>
  )
}
