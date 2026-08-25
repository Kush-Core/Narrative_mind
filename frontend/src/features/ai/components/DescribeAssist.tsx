import { SparklesIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { AiPulse } from "@/features/ai/components/AiPulse"
import { useDescribe } from "@/features/ai/queries/ai.queries"
import { toUserMessage, toUserTitle } from "@/shared/api/error-presentation"
import type { FieldAssistContext } from "@/shared/entity-kit/types"
import { Button } from "@/shared/ui/button"

/**
 * "Suggest" — the describe assist, in an entity form's label row.
 *
 * This is the AI surface the architecture doc named several milestones ago:
 * *"a 'Describe' assist in the entity form ... the generic form's escape-hatch
 * slots are the attach points."* It reaches the four entity forms through
 * `EntityFieldSpec.assist`, so `entity-kit` still contains no AI code and no
 * per-entity branch.
 *
 * **The text lands directly in the field.** There is no accept/reject step,
 * because there is nothing to accept: the user is already editing a form, the
 * value is already editable, and nothing is saved until they save. A
 * confirmation dialog would be ceremony around a draft. The one thing worth
 * guarding is *destruction* — replacing prose the user already wrote — so the
 * button asks once before overwriting a non-empty field, and not otherwise.
 *
 * ---------------------------------------------------------------------------
 * Why this one AI surface toasts
 * ---------------------------------------------------------------------------
 *
 * Every other AI failure renders inline, in the panel the user is looking at.
 * A label row has no panel: it is a single line shared with a character
 * counter, and a sentence like "The server encountered an error" does not fit
 * in it. The alternatives are worse — reporting it as the field's validation
 * error would set `aria-invalid` on a textarea that is not invalid, and saying
 * nothing would leave a pressed button that visibly did nothing.
 *
 * So this is exactly the case `error-presentation.ts` already assigns to a
 * toast: a write failed, and the surrounding content is still valid and
 * interactive. The AI mutations suppress the shared mutation toast, so it is
 * raised here rather than centrally.
 */

interface DescribeAssistProps {
  context: FieldAssistContext
  /** Field holding the entity's name — the one required input. */
  nameField?: string
  /**
   * Fields whose values are sent as traits. Only short, categorical fields
   * belong here: they are prompt material, not a summary of the record.
   */
  traitFields?: readonly string[]
}

/** A field value usable as prompt material, or nothing. */
function asTrait(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined
}

export function DescribeAssist({
  context,
  nameField = "name",
  traitFields = [],
}: DescribeAssistProps) {
  const [confirming, setConfirming] = useState(false)

  const describe = useDescribe({
    onSuccess: (result) => {
      context.apply(result.description)
      setConfirming(false)
    },
  })

  const name = asTrait(context.readField(nameField)) ?? ""
  const hasExistingText = asTrait(context.value) !== undefined
  const { error } = describe

  // One toast per failure: TanStack holds the same error object until the next
  // attempt, so this does not re-fire as the form re-renders around it.
  useEffect(() => {
    if (error === undefined) return
    toast.error(toUserTitle(error), { description: toUserMessage(error) })
  }, [error])

  function handleClick() {
    if (describe.isPending) {
      describe.cancel()
      return
    }

    if (hasExistingText && !confirming) {
      setConfirming(true)
      return
    }

    setConfirming(false)
    describe.run({
      name,
      traits: traitFields.map((field) => asTrait(context.readField(field))).filter(isPresent),
    })
  }

  const label = describe.isPending
    ? "Writing…"
    : confirming
      ? "Replace?"
      : hasExistingText
        ? "Suggest again"
        : "Suggest"

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      // Losing focus abandons a pending confirmation: a button still reading
      // "Replace?" after the user has moved on is a trap.
      onBlur={() => setConfirming(false)}
      onClick={handleClick}
      disabled={context.disabled || (name === "" && !describe.isPending)}
      title={name === "" ? "Give this a name first" : undefined}
      // While a request is in flight the visible text is the *status*, so the
      // action the button performs is named for assistive technology instead.
      aria-label={describe.isPending ? "Stop writing the description" : undefined}
      className={confirming ? "text-warning" : undefined}
    >
      {describe.isPending ? <AiPulse size="sm" /> : <SparklesIcon aria-hidden />}
      {label}
    </Button>
  )
}
