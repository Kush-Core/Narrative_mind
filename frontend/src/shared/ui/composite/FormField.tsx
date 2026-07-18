import type { ReactNode } from "react"
import { useId } from "react"

import { cn } from "@/shared/lib/utils"
import { Label } from "@/shared/ui/label"

/**
 * The atom every form field is built from (docs/frontend/COMPONENT_HIERARCHY.md §4):
 * label, control, optional hint, and validation message — wired together so the
 * accessibility relationships are correct by construction rather than by each
 * caller remembering them.
 *
 * `children` is a render prop receiving the ids the control must adopt, which
 * keeps this component agnostic about *which* control it wraps: input, textarea,
 * select, or a custom one.
 */

export interface FormFieldRenderProps {
  id: string
  describedBy: string | undefined
  invalid: boolean
}

interface FormFieldProps {
  label: string
  /** Validation message; its presence marks the field invalid. */
  error?: string
  /** Static helper text shown when there is no error. */
  description?: ReactNode
  required?: boolean
  /** Live character count or similar, shown beside the label. */
  hint?: ReactNode
  className?: string
  children: (props: FormFieldRenderProps) => ReactNode
}

export function FormField({
  label,
  error,
  description,
  required = false,
  hint,
  className,
  children,
}: FormFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const descriptionId = `${id}-description`
  const invalid = error !== undefined

  // Point the control at whichever message is actually rendered, so screen
  // readers announce the error rather than stale help text.
  const describedBy = invalid ? errorId : description ? descriptionId : undefined

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className={cn(invalid && "text-destructive")}>
          {label}
          {required ? (
            <span className="text-destructive" aria-hidden>
              *
            </span>
          ) : null}
        </Label>
        {hint ? <span className="text-2xs text-muted-foreground">{hint}</span> : null}
      </div>

      {children({ id, describedBy, invalid })}

      {invalid ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : description ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  )
}
