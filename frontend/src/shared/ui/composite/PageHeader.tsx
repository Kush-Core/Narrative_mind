import type { ReactNode } from "react"

import { cn } from "@/shared/lib/utils"

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Accent bar colour, supplied as a token-backed class (e.g. entity accents). */
  accentClassName?: string
  /** Primary actions for the screen, right-aligned. */
  actions?: ReactNode
  /** Filters, tabs, or a `Toolbar` rendered beneath the title row. */
  children?: ReactNode
  className?: string
}

/**
 * Consistent framing for every screen: title, optional description, right-aligned
 * actions, and an optional secondary row. A thin accent rail lets a screen carry
 * its subject's identity colour without any component knowing what that subject
 * is (docs/frontend/COMPONENT_HIERARCHY.md §4).
 */
export function PageHeader({
  title,
  description,
  accentClassName,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "relative flex shrink-0 flex-col gap-3 border-b bg-background px-5 py-4",
        className,
      )}
    >
      {accentClassName ? (
        <span
          aria-hidden
          className={cn("absolute inset-y-0 left-0 w-0.5 bg-current", accentClassName)}
        />
      ) : null}

      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="max-w-prose text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>

      {children}
    </header>
  )
}
