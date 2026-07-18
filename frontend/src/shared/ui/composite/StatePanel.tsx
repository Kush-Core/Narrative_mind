import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/shared/lib/utils"

/**
 * The shared layout behind the three non-happy-path surfaces (empty, error,
 * loading). They differ only in icon, tone, and content, so the *layout* is
 * written once here and each surface is a thin, well-named wrapper
 * (docs/frontend/COMPONENT_HIERARCHY.md §4).
 *
 * Centred in the available space and layout-preserving, so a list swapping
 * between states never shifts the surrounding chrome.
 */

export interface StatePanelProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  /** Primary recovery or entry action. */
  action?: ReactNode
  tone?: "neutral" | "danger"
  className?: string
}

export function StatePanel({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
  className,
}: StatePanelProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-48 w-full flex-col items-center justify-center gap-3 px-8 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-md border",
            tone === "danger"
              ? "border-destructive/25 bg-destructive/10 text-destructive"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
