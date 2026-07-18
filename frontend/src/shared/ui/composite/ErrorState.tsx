import { TriangleAlertIcon } from "lucide-react"

import { Button } from "@/shared/ui/button"
import { StatePanel, type StatePanelProps } from "@/shared/ui/composite/StatePanel"

interface ErrorStateProps extends Omit<StatePanelProps, "tone" | "action"> {
  /** Rendered as a "Try again" button when provided. */
  onRetry?: () => void
  action?: StatePanelProps["action"]
}

/**
 * Something failed. Always offers a way forward: a caller-supplied action, or
 * the standard retry when the operation is repeatable.
 */
export function ErrorState({
  icon = TriangleAlertIcon,
  title = "Something went wrong",
  onRetry,
  action,
  ...props
}: ErrorStateProps) {
  return (
    <StatePanel
      icon={icon}
      title={title}
      tone="danger"
      action={
        action ??
        (onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined)
      }
      {...props}
    />
  )
}
