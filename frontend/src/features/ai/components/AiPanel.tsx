import type { ReactNode } from "react"

import { AiPulse } from "@/features/ai/components/AiPulse"
import { cn } from "@/shared/lib/utils"
import { SectionLabel } from "@/shared/ui/composite/SectionLabel"

/**
 * The frame every AI surface sits in.
 *
 * Four features that each invented their own padding, heading treatment, and
 * footer rule would read as four products bolted together. Writing the frame
 * once makes spacing, type scale, and alignment a single decision — and it uses
 * the workspace's existing rhythm rather than a new one: `px-5 py-4` and the
 * hairline `border-t pt-4` footer are the same measurements `PageHeader`,
 * `LoadingState`, and `EntityForm` already use.
 *
 * No shadow. The token set is explicit that shadows appear "only where
 * something genuinely floats above the workspace", and a panel does not.
 *
 * The header pulse is the only signal that survives whatever the body is doing.
 * It lives here rather than in each body so that a surface still showing a
 * previous result says it is working — dimming that result is `AiStateRegion`'s
 * job, since only it knows whether the body is stale content or a fresh pulse.
 */

interface AiPanelProps {
  /** Section heading — rendered through the workspace's one label treatment. */
  label: string
  /** A request is in flight: shows the header pulse. */
  busy?: boolean
  /** Controls for the panel itself, right-aligned in the header. */
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
}

export function AiPanel({
  label,
  busy = false,
  actions,
  footer,
  children,
  className,
}: AiPanelProps) {
  return (
    <section
      data-slot="ai-panel"
      className={cn("flex min-w-0 flex-col rounded-lg border bg-card", className)}
    >
      <header className="flex min-h-8 shrink-0 items-center gap-2 border-b px-5 py-2.5">
        <SectionLabel>{label}</SectionLabel>
        {busy ? <AiPulse size="sm" /> : null}
        {actions ? <div className="ml-auto flex items-center gap-1.5">{actions}</div> : null}
      </header>

      <div className="flex min-w-0 flex-col gap-4 px-5 py-4">{children}</div>

      {footer ? <div className="shrink-0 border-t px-5 py-3">{footer}</div> : null}
    </section>
  )
}
