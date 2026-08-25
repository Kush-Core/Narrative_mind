import { SparklesIcon, SquareIcon } from "lucide-react"
import type { KeyboardEvent } from "react"

import { AI_LIMITS } from "@/features/ai/model/ai.schema"
import { Button } from "@/shared/ui/button"
import { FormField } from "@/shared/ui/composite/FormField"
import { KeyboardHint } from "@/shared/ui/composite/Kbd"
import { Textarea } from "@/shared/ui/textarea"

/**
 * The prompt input shared by the question and the passage.
 *
 * Built on `FormField` so the label, character counter, `aria-describedby`, and
 * `role="alert"` message are inherited rather than re-implemented — the same
 * atom every entity form field uses, which is why an AI prompt sits in the app
 * without announcing itself as something new.
 *
 * Two behaviours are load-bearing and must hold for both prompts:
 *
 *  - **⌘/Ctrl+Enter submits; plain Enter is a newline.** A passage is
 *    multi-line, and a question often wants to be. If the two prompts disagreed
 *    about which key sends, the muscle memory learned on one would destroy work
 *    on the other.
 *  - **The submit button becomes Stop.** A label and icon swap in the same
 *    position — not a second control appearing beside it. This is the rule that
 *    keeps every AI surface at a constant control count across all four of its
 *    states, and it is why cancellation lives here rather than in the pending
 *    surface.
 *
 * The counter's bound is `AI_LIMITS`, the same constant the Zod schemas enforce,
 * so what the user is told and what the backend accepts cannot drift.
 */

export type AiPromptLimit = keyof typeof AI_LIMITS

interface AiPromptFieldProps {
  /** Matches the backend field name, so a 422 maps onto this input. */
  name: AiPromptLimit
  label: string
  placeholder?: string
  description?: string
  value: string
  onChange: (value: string) => void
  /** Inline validation message, from the client schema or a server 422. */
  error?: string
  rows?: number
  isPending: boolean
  /** False while the value would only ever earn a 422. */
  canSubmit: boolean
  submitLabel: string
  onSubmit: () => void
  onCancel: () => void
}

export function AiPromptField({
  name,
  label,
  placeholder,
  description,
  value,
  onChange,
  error,
  rows = 3,
  isPending,
  canSubmit,
  submitLabel,
  onSubmit,
  onCancel,
}: AiPromptFieldProps) {
  const maxLength = AI_LIMITS[name].max

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return
    if (!event.metaKey && !event.ctrlKey) return

    event.preventDefault()
    if (isPending || !canSubmit) return
    onSubmit()
  }

  return (
    <div className="flex flex-col gap-2">
      <FormField
        label={label}
        error={error}
        description={description}
        hint={`${value.length}/${maxLength}`}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            rows={rows}
            value={value}
            placeholder={placeholder}
            maxLength={maxLength}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
      </FormField>

      <div className="flex items-center justify-end gap-2">
        {/* Keyboard-first is a product principle, so the shortcut is shown
            rather than left to be discovered. */}
        <KeyboardHint shortcut="mod+enter" className="text-muted-foreground" />

        {isPending ? (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            <SquareIcon aria-hidden />
            Stop
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={!canSubmit} onClick={onSubmit}>
            <SparklesIcon aria-hidden />
            {submitLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
