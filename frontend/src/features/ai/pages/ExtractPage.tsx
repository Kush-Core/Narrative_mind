import { ScanTextIcon } from "lucide-react"
import { useState } from "react"

import { AiPanel } from "@/features/ai/components/AiPanel"
import { AiPromptField } from "@/features/ai/components/AiPromptField"
import { AiStateRegion } from "@/features/ai/components/AiStateRegion"
import { ExtractResults } from "@/features/ai/components/ExtractResults"
import { ExtractFormSchema } from "@/features/ai/model/ai.schema"
import { useExtract } from "@/features/ai/queries/ai.queries"
import { EmptyState } from "@/shared/ui/composite/EmptyState"
import { PageHeader } from "@/shared/ui/composite/PageHeader"

/**
 * Reading a passage of prose for the people, places, factions, and events in it.
 *
 * Structurally the twin of `AskPage`: the same frame, the same prompt field, the
 * same state machine, the same panel. Only the copy and the result body differ.
 * That is the point — someone who has used one has already learned the other.
 *
 * The passage is held in local state rather than the URL, unlike Ask's `?q=`. A
 * question is short and worth sharing; a 5000-character passage is neither, and
 * would make the address bar unusable.
 */

export function ExtractPage() {
  const [passage, setPassage] = useState("")
  const extract = useExtract()

  const parsed = ExtractFormSchema.safeParse({ passage })

  function submit() {
    if (!parsed.success) return
    extract.run(parsed.data)
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <PageHeader
        title="Extract from text"
        description="Read a passage for the people, places, factions, and events it names. Nothing is written to your world."
      />

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <AiPanel label="Passage">
            <AiPromptField
              name="passage"
              label="Paste a passage"
              placeholder="Aria Vane rode north to Kestrelwatch, where the Verge Watch still held the gate…"
              description="At least 10 characters. Naming people and places directly gives the extractor more to work with."
              value={passage}
              onChange={setPassage}
              error={extract.error?.fieldErrors?.passage}
              rows={8}
              isPending={extract.isPending}
              canSubmit={parsed.success && !extract.isPending}
              submitLabel="Extract"
              onSubmit={submit}
              onCancel={extract.cancel}
            />
          </AiPanel>

          <AiPanel label="Proposals" busy={extract.isPending}>
            <AiStateRegion
              request={extract}
              pendingLabel="Reading the passage…"
              idle={
                <EmptyState
                  icon={ScanTextIcon}
                  title="Nothing read yet"
                  description="Paste a passage above to see the entities and relationships it describes, and which of them your world already holds."
                />
              }
            >
              {(result) => <ExtractResults result={result} />}
            </AiStateRegion>
          </AiPanel>
        </div>
      </div>
    </div>
  )
}
