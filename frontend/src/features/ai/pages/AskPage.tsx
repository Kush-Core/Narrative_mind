import { useSearchParams } from "react-router-dom"

import { AskPanel } from "@/features/ai/components/AskPanel"
import { PageHeader } from "@/shared/ui/composite/PageHeader"

/**
 * The Ask route.
 *
 * A thin frame: the standard `PageHeader` and a scrolling body, with the entire
 * experience delegated to `AskPanel` so the route and the dockable panel are
 * provably the same thing.
 *
 * `?q=` prefills the question, which makes a good question shareable — the same
 * "URL owns what you are looking at" rule the graph workspace follows. It is a
 * *prefill*, not a trigger: landing on a URL must never spend a model call on
 * the user's behalf, and the question is often worth editing before asking.
 */

export const ASK_QUESTION_PARAM = "q"

export function AskPage() {
  const [searchParams] = useSearchParams()
  const initialQuestion = searchParams.get(ASK_QUESTION_PARAM) ?? ""

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <PageHeader
        title="Ask the world"
        description="Answers are grounded in the entities and relationships you have written, and cite what they drew on."
      />

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {/* The panel is capped rather than fluid: this is the one long-form
            reading surface in a workspace built for dense tables, and prose run
            to the full width of a desktop panel is not readable. */}
        <div className="mx-auto w-full max-w-3xl">
          {/* Remounting on a changed `?q=` lets a shared link start from its own
              question rather than inheriting whatever was typed before it. */}
          <AskPanel key={initialQuestion} initialQuestion={initialQuestion} />
        </div>
      </div>
    </div>
  )
}
